/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/https', 'N/record', 'N/search'],
    /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 */
    (https, record, search) => {
        'use strict';

        // function to check if customer or item is existing.

        const SHOPIFY_API_KEY = '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';
        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

        const getCustomer = (customer) => {
            try {
                let customerSearch = search.create({
                    type: search.Type.CUSTOMER,
                    filters: [['email', 'is', customer.email]],
                    columns: ['internalid','email','entityid']
                });

                let customerArray = customerSearch.run().getRange({ start: 0, end: 1 });
                return customerArray.length > 0 ? customerArray[0].getValue('internalid') : null;
            } catch (error) {
                log.error("error in getcustomer()",error);
            }
        }

        const createCustomer = (customer) => {
            try {
                let rec = record.create({ type: record.Type.CUSTOMER, isDynamic: true });
                let firstName = customer.first_name;
                let lastName = customer.last_name;
                let fullName = `${firstName} ${lastName}`.trim();
                rec.setValue({ fieldId: 'entityid', value: fullName });
                rec.setValue({ fieldId: 'email', value: customer.email });
                rec.setValue({ fieldId: 'companyname', value: fullName });
                rec.setValue({ fieldId: 'subsidiary', value: 1 });
                return rec.save();
            } catch (error) {
                log.error("error in createcustomer()",error);
            }
        }

        const getItem = (itemId) => {
            try {
                let itemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [['isinactive', 'is', 'F'], 'AND',
                        ['itemid','is',itemId]
                    ],
                    columns: ['internalid']
                });
                let item = itemSearch.run().getRange({start: 0, end: 1});
                return item.length > 0 ? item[0].getValue('internalid') : null;
            } catch (error) {
                log.error("error in getItem()",error);
            }
        }

        const createItem = (itemShopify) => {
            try {
                let item = record.create({
                    type: record.Type.INVENTORY_ITEM,
                    isDynamic: true
                });
                item.setValue({ fieldId: 'itemid', value: itemShopify.sku });
                item.setValue({ fieldId: 'baseprice', value: itemShopify.price });
                item.setValue({ fieldId: 'taxschedule', value: 1 });
                item.setValue({ fieldId: 'subsidiary', value: 1 });
                return item.save();
            } catch (error) {
                log.error("error in creatItem()",error);
            }
        }

        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */

        const getInputData = (inputContext) => {
            try {
                let orderFetchUrl = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-10/orders.json?status=any`;
                let orderFetchRes = https.get({
                    url: orderFetchUrl,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': SHOPIFY_API_KEY
                    }
                });
                let orders = JSON.parse(orderFetchRes.body).orders || [];
                log.error("orders from shopify: ",orders);
                return orders;
            } catch (error) {
                log.error("error in getinputData()",error);
            }
        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        const map = (mapContext) => {
            try {
                let order = JSON.parse(mapContext.value);
                let customer = getCustomer(order.customer)
                if(!customer) {
                    customer = createCustomer(order.customer);
                }
                let lineItems = order.line_items;
                let items = []
                log.error("items: ",lineItems);
                lineItems.forEach((item) => {
                    let line_item = getItem(item.sku);
                    let itemId = line_item || createItem(item);
                    if (itemId) {
                        items.push({ id: itemId, quantity: item.quantity });
                    }
                });
                if(customer && items.length > 0) {
                    let salesOrder = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });
                    salesOrder.setValue({ fieldId: 'entity', value: customer });
                    items.forEach((item,index) => {
                        salesOrder.selectNewLine({ sublistId: 'item' });
                        log.error("item id: ",item.id);
                        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item.id });
                        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.quantity });
                        salesOrder.commitLine({ sublistId: 'item' });
                    });
                    salesOrder.save();
                }else {
                    log.error("customer or item is empty...");
                }
            } catch (error) {
                log.error("error in map()",error);
            }
        }

        return {getInputData, map}

    });
