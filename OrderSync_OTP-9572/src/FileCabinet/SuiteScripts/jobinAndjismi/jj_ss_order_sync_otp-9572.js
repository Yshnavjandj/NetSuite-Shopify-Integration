/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/https', 'N/record', 'N/search'],
    (https, record, search) => {
        'use strict';

        const SHOPIFY_API_KEY = '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';
        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

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
            }
        };

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
            }
        };

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
            }
        };

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
            }
        };

        const processOrders = () => {
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

        const execute = (scriptContext) => {
            try {
                processOrders();
            } catch (error) {
                log.error("error in processOrders() function",error);
            }
        };

        return { execute };
    });
