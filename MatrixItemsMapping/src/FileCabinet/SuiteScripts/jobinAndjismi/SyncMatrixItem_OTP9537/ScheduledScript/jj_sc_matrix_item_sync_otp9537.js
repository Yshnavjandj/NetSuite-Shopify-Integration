/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
/**********************************************************************************************************************************
* Training
* 
* ${OTP} : ${Onboard Training Program}
*
**********************************************************************************************************************************
*
* Author: Jobin & Jismi
*
* Date Created : 8-October-2025
*
* Description : This scheduled script is used to sync matrix items from NetSuite to shopify
*
* REVISION HISTORY
*
* @version 1.0 OTP-9537 : 8-October-2025 : Created the initial build by JJ0363
*
*********************************************************************************************************************************/
define(['N/https', 'N/search', 'N/record', 'N/file', 'N/runtime'],
    /**
 * @param{https} https
 * @param{search} search
 * @param{record} record
 * @param{file} file
 * @param{runtime} runtime
 */
    (https, search, record, file, runtime) => {

        'use strict'

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe.myshopify.com';

        /**
         * Retrieve the Shopify API key from script parameters
         * @returns {string} - Shopify API key from the script parameters
        */
        const getShopifyApiKey = () => {
            try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_jj_shopify_access_tkn'
                });
            } catch (error) {
                log.error("error in fetching shopify api key");
                return '';
            }
        };

        let shopifyApiToken = getShopifyApiKey();

        /**
         * Defines the Scheduled script trigger point.
         * @param {Object} scriptContext
         * @param {string} scriptContext.type - Script execution context. Use values from the scriptContext.InvocationType enum.
         * @since 2015.2
         */
        const execute = (scriptContext) => {
            try {
                pushMatrixItemToShopify(shopifyApiToken,SHOPIFY_STORE_DOMAIN);
                pullShopifyOrdersToNetSuite(shopifyApiToken,SHOPIFY_STORE_DOMAIN);
            } catch (error) {
                log.error("error in pushing item/ syncing order",error);
            }
        }

        /**
         * Pushes a matrix item from NetSuite to Shopify, including variants and associated image.
         * @param {string} shopify_api_key - The API key for authenticating with Shopify.
         * @param {string} shopify_store_domain - The domain of the Shopify store.
         */
        const pushMatrixItemToShopify = (shopify_api_key,shopify_store_domain) => {
            try {
                let parentSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [
                        ['matrix', 'is', 'T'], 'AND',
                        ['isinactive', 'is', 'F'], 'AND',
                        ['internalid', 'is', 330]
                    ],
                    columns: ['internalid', 'itemid', 'custitem10', 'custitem11', 'storedisplayimage']
                });
                parentSearch.run().each(parentResult => {
                    let parentId = parentResult.getValue({ name: 'internalid' });
                    let parentName = parentResult.getValue({ name: 'itemid' });
                    let imageId = parentResult.getValue({name: 'storedisplayimage'});
                    log.error("img id: ",imageId);
                    let imageFileObj = file.load({id: imageId});
                    log.error("img obj: ",imageFileObj);
                    let imageUrl = imageFileObj.url;
                    imageUrl = `https://${runtime.accountId.toLowerCase()}.app.netsuite.com${imageUrl}`;
                    let variantSearch = search.create({
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
                        let sku = variant.getValue('itemid');;
                        let color = variant.getText('custitem10');
                        let size = variant.getText('custitem11');
                        let price = parseFloat(variant.getValue('baseprice')) || 0;
                        let quantity = parseInt(variant.getValue('quantityavailable')) || 0;
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
                    let url = `https://${shopify_store_domain}/admin/api/2023-07/products.json`;
                    let variantEndPint = `https://${shopify_store_domain}/admin/api/2023-07/variants.json`;
                    let imageEndPoint = `https://${shopify_store_domain}/admin/api/2023-07/products/${productId}/images.json`;
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
                    let response = https.post({
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

        /**
         * Pulls recent orders from Shopify and creates corresponding sales orders in NetSuite.
         * @param {string} shopify_api_key - The API key for authenticating with Shopify.
         * @param {string} shopify_store_domain - The domain of the Shopify store.
         */
        function pullShopifyOrdersToNetSuite(shopify_api_key,shopify_store_domain) {
            try {
                let url = `https://${shopify_store_domain}/admin/api/2023-07/orders.json?status=any&limit=5`;
                let response = https.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopify_api_key
                    }
                });
                let orders = JSON.parse(response.body).orders || [];
                for (let order of orders) {
                    log.debug('Shopify Order', order.name);
                    let customerId = getOrCreateCustomer(order);
                    if (!customerId) continue;
                    let so = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });
                    so.setValue({ fieldId: 'entity', value: customerId });
                    so.setValue({ fieldId: 'memo', value: `Shopify Order ${order.name}` });
                    for (let item of order.line_items) {
                        let itemId = findItemBySKU(item.sku);
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
                    let soId = so.save();
                    log.audit('Sales Order Created', `Order ID: ${soId}`);
                }
            } catch (e) {
                log.error('Error pulling Shopify orders', e.message);
            }
        }

        /**
         * Finds a NetSuite inventory item by its SKU.
         * @param {string} sku - The SKU of the item to search for.
         * @returns {string|null} - The internal ID of the item if found, otherwise null.
         */
        function findItemBySKU(sku) {
            try {
                let itemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [['itemid', 'is', sku]],
                    columns: ['internalid']
                });
                let result = itemSearch.run().getRange({ start: 0, end: 1 });
                return result.length > 0 ? result[0].getValue('internalid') : null;
            } catch (error) {
                log.error("error in finding item sku",error);
                return [];
            }
        }

        /**
         * Retrieves an existing NetSuite customer by email or creates a new one from Shopify order data.
         * @param {Object} order - The Shopify order object containing customer information.
         * @returns {string|null} - The internal ID of the customer record.
         */
        function getOrCreateCustomer(order) {
            try {
                let email = order.email;
                if (!email) return null;
                let custSearch = search.create({
                    type: search.Type.CUSTOMER,
                    filters: [['email', 'is', email]],
                    columns: ['internalid']
                });
                let result = custSearch.run().getRange({ start: 0, end: 1 });
                if (result.length > 0) return result[0].getValue('internalid');   
                let customer = record.create({ type: record.Type.CUSTOMER, isDynamic: true });
                let firstName = order.customer?.first_name || 'Shopify';
                let lastName = order.customer?.last_name || 'Customer';
                let fullName = `${firstName} ${lastName}`;
                customer.setValue({ fieldId: 'companyname', value: fullName });
                customer.setValue({ fieldId: 'subsidiary', value: 11 });
                customer.setValue({ fieldId: 'email', value: email });
                customer.setValue({ fieldId: 'firstname', value: firstName });
                customer.setValue({ fieldId: 'lastname', value: lastName });
                return customer.save();
            } catch (error) {
                log.error("error in fetching/creating customer",error);
                return '';
            }
        }

        return { execute }

    });
