/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/https', 'N/search', 'N/record', 'N/file', 'N/runtime'],
    /**
 * @param{https} https
 * @param{search} search
 * @param{record} record
 * @param{file} file
 * @param{runtime} runtime
 */
    (https, search, record, file, runtime) => {

        /**
         * Defines the Scheduled script trigger point.
         * @param {Object} scriptContext
         * @param {string} scriptContext.type - Script execution context. Use values from the scriptContext.InvocationType enum.
         * @since 2015.2
         */
        const execute = (scriptContext) => {
            try {
                const SHOPIFY_API_KEY = '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';
                const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe.myshopify.com';
                pushMatrixItemToShopify(SHOPIFY_API_KEY,SHOPIFY_STORE_DOMAIN);
                pullShopifyOrdersToNetSuite(SHOPIFY_API_KEY,SHOPIFY_STORE_DOMAIN);
            } catch (error) {
                log.error("error in pushing item/ syncing order",error);
            }
        }

        const pushMatrixItemToShopify = (shopify_api_key,shopify_store_domain) => {
            try {
                const parentSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [
                        ['matrix', 'is', 'T'], 'AND',
                        ['isinactive', 'is', 'F'], 'AND',
                        ['internalid', 'is', 330]
                    ],
                    columns: ['internalid', 'itemid', 'custitem10', 'custitem11', 'storedisplayimage']
                });

                parentSearch.run().each(parentResult => {
                    const parentId = parentResult.getValue({ name: 'internalid' });
                    const parentName = parentResult.getValue({ name: 'itemid' });
                    let imageId = parentResult.getValue({name: 'storedisplayimage'});
                    log.error("img id: ",imageId);
                    let imageFileObj = file.load({id: imageId});
                    log.error("img obj: ",imageFileObj);
                    let imageUrl = imageFileObj.url;
                    imageUrl = `https://${runtime.accountId.toLowerCase()}.app.netsuite.com${imageUrl}`;
                    const variantSearch = search.create({
                        type: search.Type.INVENTORY_ITEM,
                        filters: [
                            ['parent', 'anyof', parentId], 'AND',
                            ['isinactive', 'is', 'F']
                        ],
                        columns: [
                            'itemid', 'internalid', 'custitem10', 'custitem11',
                            'baseprice', 'quantityavailable'
                        ]
                    });

                    let matrixChilds = [];
                    let optionValuesColor = new Set();
                    let optionValuesSize = new Set();

                    variantSearch.run().each(variant => {
                        const sku = variant.getValue('itemid');;
                        const color = variant.getText('custitem10');
                        const size = variant.getText('custitem11');
                        const price = parseFloat(variant.getValue('baseprice')) || 0;
                        const quantity = parseInt(variant.getValue('quantityavailable')) || 0;

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

                    let shopifyPayload = {
                        product: {
                            title: parentName,
                            options: [
                                { name: "Color", values: Array.from(optionValuesColor) },
                                { name: "Size", values: Array.from(optionValuesSize) }
                            ],
                            variants: matrixChilds
                        }
                    };

                    log.debug('Shopify Payload', JSON.stringify(shopifyPayload));

                    let productId = 8207462760635;
                    const url = `https://${shopify_store_domain}/admin/api/2023-07/products.json`;
                    const variantEndPint = `https://${shopify_store_domain}/admin/api/2023-07/variants.json`;
                    const imageEndPoint = `https://${shopify_store_domain}/admin/api/2023-07/products/${productId}/images.json`;

                    let productsShopify = https.get({
                        url: variantEndPint,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': shopify_api_key
                        }
                    });

                    let shopifyData = JSON.parse(productsShopify.body);
                    let shopifyVariants = shopifyData.variants || [];

                    log.error("shopify pd data: ",shopifyData);
                    log.error("products form shopify: ",shopifyVariants);
                    log.error("matrix child from netsuite: ",matrixChilds);

                    let variantIds = []
                    shopifyVariants.forEach((variant) => {
                        variantIds.push(variant.id)
                    });

                    let imagePayLoad = {
                        image: {
                            src: imageUrl,
                            variant_ids: variantIds
                        }
                    }

                    log.error("shopify payload: ", shopifyPayload);

                    const response = https.post({
                        url: imageEndPoint,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': shopify_api_key
                        },
                        body: JSON.stringify(imagePayLoad)
                    });

                    if (response.code === 201 || response.code === 200) {
                        log.error('Shopify Product Created', `Parent Item: ${parentName}, Response: ${response.body}`);
                    } else {
                        log.error('Shopify API Error', `Status: ${response.code}, Body: ${response.body}`);
                    }

                    return true;
                });

            } catch (e) {
                log.error('Error in Scheduled Script', e.message);
            }
        }

        function pullShopifyOrdersToNetSuite(shopify_api_key,shopify_store_domain) {
            try {
                const url = `https://${shopify_store_domain}/admin/api/2023-07/orders.json?status=any&limit=5`;
                const response = https.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopify_api_key
                    }
                });

                const orders = JSON.parse(response.body).orders || [];

                for (let order of orders) {
                    log.debug('Shopify Order', order.name);

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
        }

        function findItemBySKU(sku) {
            const itemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: [['itemid', 'is', sku]],
                columns: ['internalid']
            });

            const result = itemSearch.run().getRange({ start: 0, end: 1 });
            return result.length > 0 ? result[0].getValue('internalid') : null;
        }

        function getOrCreateCustomer(order) {
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
            let firstName = order.customer?.first_name || 'Shopify';
            let lastName = order.customer?.last_name || 'Customer';
            let fullName = `${firstName} ${lastName}`;
            customer.setValue({ fieldId: 'companyname', value: fullName });
            customer.setValue({ fieldId: 'subsidiary', value: 11 });
            customer.setValue({ fieldId: 'email', value: email });
            customer.setValue({ fieldId: 'firstname', value: firstName });
            customer.setValue({ fieldId: 'lastname', value: lastName });

            return customer.save();
        }

        return { execute }

    });
