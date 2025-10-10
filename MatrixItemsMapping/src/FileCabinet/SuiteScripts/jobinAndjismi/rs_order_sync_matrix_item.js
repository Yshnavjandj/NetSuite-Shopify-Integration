/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/https', 'N/search', 'N/record'], 
    /**
 * @param{https} https
 * @param{search} search
 * @param{record} record
 */
    (https, search, record) => {

        const SHOPIFY_API_KEY = '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';
        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe.myshopify.com';

        const post = (requestBody) => {
            try {
                log.audit('RESTlet Triggered', 'Pushing items to Shopify and pulling orders');
                // pushMatrixItemToShopify();
                pullShopifyOrdersToNetSuite();
                return { status: 'Success', message: 'Shopify sync completed.' };
            } catch (error) {
                log.error("Shopify Sync Error", error);
                return { status: 'Failed', message: error.message };
            }
        };

        const pushMatrixItemToShopify = () => {
            try {
                const parentSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [['matrix', 'is', 'T'], 'AND', ['isinactive', 'is', 'F']],
                    columns: ['internalid', 'itemid']
                });

                parentSearch.run().each(parentResult => {
                    const parentId = parentResult.getValue({ name: 'internalid' });
                    const parentName = parentResult.getValue({ name: 'itemid' });

                    const variantSearch = search.create({
                        type: search.Type.INVENTORY_ITEM,
                        filters: [['parent', 'anyof', parentId], 'AND', ['isinactive', 'is', 'F']],
                        columns: [
                            'itemid', 'custitem10', 'custitem11', 'baseprice', 'quantityavailable'
                        ]
                    });

                    let matrixChilds = [];
                    let optionValuesColor = new Set();
                    let optionValuesSize = new Set();
                    let skuList = [];

                    variantSearch.run().each(variant => {
                        const sku = variant.getValue('itemid');
                        const color = variant.getText('custitem10');
                        const size = variant.getText('custitem11');
                        const price = parseFloat(variant.getValue('baseprice')) || 0;
                        const quantity = parseInt(variant.getValue('quantityavailable')) || 0;

                        skuList.push(sku);
                        optionValuesColor.add(color);
                        optionValuesSize.add(size);

                        matrixChilds.push({
                            option1: color,
                            option2: size,
                            price: price.toFixed(2),
                            sku: sku,
                            inventory_quantity: quantity
                        });

                        return true;
                    });

                    // Get existing Shopify SKUs
                    const shopifyVariantUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/variants.json?limit=250`;
                    const variantResponse = https.get({
                        url: shopifyVariantUrl,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': SHOPIFY_API_KEY
                        }
                    });

                    const shopifySkus = (JSON.parse(variantResponse.body).variants || []).map(v => v.sku);
                    const isAlreadyInShopify = skuList.some(sku => shopifySkus.includes(sku));

                    if (isAlreadyInShopify) {
                        log.audit('Skipping existing item', parentName);
                        return true;
                    }

                    // Create product in Shopify
                    const shopifyPayload = {
                        product: {
                            title: parentName,
                            options: [
                                { name: "Color", values: Array.from(optionValuesColor) },
                                { name: "Size", values: Array.from(optionValuesSize) }
                            ],
                            variants: matrixChilds
                        }
                    };

                    const createProductUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/products.json`;
                    const createResponse = https.post({
                        url: createProductUrl,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': SHOPIFY_API_KEY
                        },
                        body: JSON.stringify(shopifyPayload)
                    });

                    if (createResponse.code === 201 || createResponse.code === 200) {
                        log.audit('Shopify Product Created', parentName);
                    } else {
                        log.error('Shopify Creation Error', createResponse.body);
                    }

                    return true;
                });

            } catch (e) {
                log.error('Error in pushMatrixItemToShopify()', e.message);
            }
        };

        const pullShopifyOrdersToNetSuite = () => {
            try {
                const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/orders.json?status=any&limit=5`;
                const response = https.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': SHOPIFY_API_KEY
                    }
                });

                const orders = JSON.parse(response.body).orders || [];

                for (let order of orders) {
                    const customerId = getOrCreateCustomer(order);
                    if (!customerId) continue;

                    const so = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });
                    so.setValue({ fieldId: 'entity', value: customerId });
                    so.setValue({ fieldId: 'memo', value: `Shopify Order ${order.name}` });

                    for (let item of order.line_items) {
                        const itemId = findItemBySKU(item.sku);
                        if (!itemId) {
                            log.error('Item not found', item.sku);
                            continue;
                        }

                        so.selectNewLine({ sublistId: 'item' });
                        so.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: itemId });
                        so.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.quantity });
                        so.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: item.price });
                        so.commitLine({ sublistId: 'item' });
                    }

                    const soId = so.save();
                    log.audit('Sales Order Created', `Order ID: ${soId}`);
                }

            } catch (e) {
                log.error('Error pulling Shopify orders', e.message);
            }
        };

        const findItemBySKU = (sku) => {
            const itemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: [['itemid', 'is', sku]],
                columns: ['internalid']
            });
            const result = itemSearch.run().getRange({ start: 0, end: 1 });
            return result.length > 0 ? result[0].getValue('internalid') : null;
        };

        const getOrCreateCustomer = (order) => {
            const email = order.email;
            if (!email) return null;

            const custSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [['email', 'is', email]],
                columns: ['internalid']
            });
            const result = custSearch.run().getRange({ start: 0, end: 1 });
            if (result.length > 0) return result[0].getValue('internalid');

            const customer = record.create({ type: record.Type.CUSTOMER, isDynamic: true });
            customer.setValue({ fieldId: 'email', value: email });
            customer.setValue({ fieldId: 'firstname', value: order.customer?.first_name || 'Shopify' });
            customer.setValue({ fieldId: 'lastname', value: order.customer?.last_name || 'Customer' });
            return customer.save();
        };

        return { post };
    });
