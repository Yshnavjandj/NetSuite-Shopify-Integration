/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/https', 'N/record', 'N/search', 'N/runtime', '../Library/jj_ns_shopify_integration.js'],
    (https, record, search, runtime, library) => {
        
        'use strict';

        /**
         * Retrieve the Shopify API key from script parameters.
         * @returns {string} - Shopify API key from the script parameters or an empty string if an error occurs.
         */
        const getShopifyApiKey = () => {
            try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_jj_shopify_api_tkn' // This is the parameter ID you set in the script record
                });
            } catch (error) {
                log.error("error in fetching shopify api key");
                return '';
            }
        };

        /**
         * Check if the order has already been synced with NetSuite.
         * @param {string} shopifyOrderId - The Shopify order ID to check.
         * @returns {boolean} - Returns true if the order is already synced, false otherwise.
         */
        const isOrderAlreadySynced = (shopifyOrderId) => {
            try {
                let result = search.create({
                    type: 'customrecord_jj_failure_track', // your record type ID
                    filters: [
                        ['custrecord125', 'is', String(shopifyOrderId)],
                        'AND',
                        ['custrecord126', 'is', 'Success']
                    ],
                    columns: ['internalid']
                }).run().getRange({ start: 0, end: 1 });

                return result.length > 0;
            } catch (e) {
                log.error('Error checking sync status', e);
                return false;
            }
        };

        /**
         * Log the attempt to sync an order.
         * @param {string} shopifyOrderId - The Shopify order ID.
         * @param {string} netsuiteOrderId - The NetSuite order ID.
         * @param {string} status - The status of the sync attempt (Success/Failure).
         */
        const logSyncAttempt = (shopifyOrderId, netsuiteOrderId, status) => {
            try {
                let rec = record.create({
                    type: 'customrecord_jj_failure_track',
                    isDynamic: true
                });
                rec.setValue({ fieldId: 'custrecord125', value: String(shopifyOrderId) });
                if (netsuiteOrderId) {
                    rec.setValue({ fieldId: 'custrecord_jj_order_id', value: netsuiteOrderId });
                }
                rec.setValue({ fieldId: 'custrecord126', value: status });
                let id = rec.save();
                log.audit('Sync status logged', { id, shopifyOrderId, status });
            } catch (e) {
                log.error('Error logging sync record', e);
            }
        };

        /**
         * Retrieve a customer based on the email address.
         * @param {Object} customer - The customer object containing email.
         * @returns {number|null} - Returns the internal ID of the customer, or null if not found.
         */
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
                log.error("error in getcustomer()", error);
                return null; // Return null in case of error
            }
        };

        /**
         * Create a customer in NetSuite.
         * @param {Object} customer - The customer object containing customer data.
         * @returns {number|null} - Returns the internal ID of the created customer or null if creation fails.
         */
        const createCustomer = (customer) => {
            try {
                let rec = record.create({ type: record.Type.CUSTOMER, isDynamic: true });
                let fullName = `${customer.first_name} ${customer.last_name}`.trim();
                rec.setValue({ fieldId: 'entityid', value: fullName });
                rec.setValue({ fieldId: 'email', value: customer.email });
                rec.setValue({ fieldId: 'companyname', value: fullName });
                rec.setValue({ fieldId: 'subsidiary', value: 1 });
                return rec.save();
            } catch (error) {
                log.error("error in createcustomer()", error);
                return null; // Return null in case of error
            }
        };

        /**
         * Retrieve an item based on its SKU.
         * @param {string} itemId - The SKU of the item to retrieve.
         * @returns {number|null} - Returns the internal ID of the item, or null if the item is not found.
         */
        const getItem = (itemId) => {
            try {
                let itemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [['isinactive', 'is', 'F'], 'AND', ['itemid','is',itemId]],
                    columns: ['internalid']
                });
                let item = itemSearch.run().getRange({start: 0, end: 1});
                return item.length > 0 ? item[0].getValue('internalid') : null;
            } catch (error) {
                log.error("error in getItem()", error);
                return null; // Return null in case of error
            }
        };

        /**
         * Create a new inventory item in NetSuite based on Shopify item data.
         * @param {Object} itemShopify - The Shopify item object containing item details.
         * @returns {number|null} - Returns the internal ID of the created item or null if creation fails.
         */
        const createItem = (itemShopify) => {
            try {
                let item = record.create({ type: record.Type.INVENTORY_ITEM, isDynamic: true });
                item.setValue({ fieldId: 'itemid', value: itemShopify.sku });
                item.setValue({ fieldId: 'baseprice', value: itemShopify.price });
                item.setValue({ fieldId: 'taxschedule', value: 1 });
                item.setValue({ fieldId: 'subsidiary', value: 1 });
                return item.save();
            } catch (error) {
                log.error("error in createItem()", error);
                return null; // Return null in case of error
            }
        };

        /**
         * Fetch and process orders from Shopify.
         * @returns {void} - Processes orders without returning any value.
         */
        const processOrders = () => {
            try {
                let shopifyApiKey = getShopifyApiKey();
                let orders = library.fetchOrdersFromShopify(shopifyApiKey)
                log.audit("orders from shopify", orders);

                orders.forEach((order) => {
                    try {
                        if (isOrderAlreadySynced(order.id)) {
                            log.error('Order already synced — skipping', order.id);
                            return;
                        }

                        let customer = getCustomer(order.customer);
                        if (!customer) {
                            customer = createCustomer(order.customer);
                        }

                        let lineItems = order.line_items;
                        let items = [];
                        log.audit("items", lineItems);
                        lineItems.forEach((item) => {
                            let itemId = getItem(item.sku) || createItem(item);
                            if (itemId) {
                                items.push({ id: itemId, quantity: item.quantity });
                            }
                        });

                        if (customer && items.length > 0) {
                            let salesOrder = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });
                            salesOrder.setValue({ fieldId: 'entity', value: customer });
                            items.forEach((item) => {
                                salesOrder.selectNewLine({ sublistId: 'item' });
                                log.audit("item id", item.id);
                                salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item.id });
                                salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.quantity });
                                salesOrder.commitLine({ sublistId: 'item' });
                            });
                            let nsOrderId = salesOrder.save();
                            logSyncAttempt(order.id, nsOrderId, 'Success');
                        } else {
                            log.error("customer or item is empty for order", order.id);
                            logSyncAttempt(order.id, null, 'Failure');
                        }

                    } catch (err) {
                        log.error("Error processing order", { orderId: order.id, error: err });
                        logSyncAttempt(order.id, null, 'Failure');
                    }
                });

            } catch (error) {
                log.error("error in processing orders", error);
            }
        };

        /**
         * The execute function to trigger the order processing.
         * @param {Object} scriptContext - The script context object passed by the scheduler.
         * @returns {void} - Calls the processOrders function without returning any value.
         */
        const execute = (scriptContext) => {
            try {
                processOrders();
            } catch (error) {
                log.error("error in processOrders() function",error);
            }
        };

        return { execute };
    });
