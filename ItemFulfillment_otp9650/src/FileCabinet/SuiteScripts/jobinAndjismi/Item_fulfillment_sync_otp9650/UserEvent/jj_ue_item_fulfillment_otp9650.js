/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
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
* Date Created : 28-October-2025
*
* Description : This user event script is used to sync item fulfillment from NetSuite to shopify
*
* REVISION HISTORY
*
* @version 1.0 OTP-9650 : 28-October-2025 : Created the initial build by JJ0363
*
*********************************************************************************************************************************/
define(['N/https', 'N/record', 'N/search'],
 /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 */
    (https, record, search) => {

        'use strict';

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

        /**
         * Retrieve the Shopify API key from script parameters
         * @returns {string} - Shopify API key from the script parameters
        */
        const getShopifyApiKey = () => {
           try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_shopify_api_token'
                });
           } catch (error) {
                log.error("error in fetching shopify api token",error);
                return '';
           }
        };

        /**
         * This function gets the corresponding Shopify Order ID from a custom field.
         * @param {string} netsuiteOrderId - The NetSuite order ID to look up in the custom record.
         * @returns {string} - The Shopify Order ID or null if not found.
        */
        const getShopifyOrderId = (netsuiteOrderId) => {
            try {
                let orderSearch = search.create({
                    type: 'customrecord_jj_failure_track',
                    filters: [
                        ['custrecord_jj_order_id', 'is', netsuiteOrderId]
                    ],
                    columns: ['custrecord125']
                });
                let result = orderSearch.run().getRange({ start: 0, end: 1 });
                if (result.length > 0) {
                    return result[0].getValue('custrecord125');
                }
                return '';
            } catch (error) {
                log.error("error in fetching shopify order id",error);
                return '';
            }
        }

        /**
         * Send the fulfillment request to Shopify for the corresponding order.
         * @param {string} shopifyOrderId - The Shopify order ID to fulfill/ship.
        */
        const fetchFulFillmentDetails = (shopifyOrderId) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/orders/${shopifyOrderId}/fulfillment_orders.json`;
                let shopifyApiKey = getShopifyApiKey();
                let response = https.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let fulfillmentResponse = JSON.parse(response.body);
                log.debug("fulfillment response: ",fulfillmentResponse);
                let fulfillmentOrder = fulfillmentResponse.fulfillment_orders.find(order => order.order_id === Number(shopifyOrderId));
                let fulfillmentLineItems = fulfillmentOrder.line_items.map(item => ({
                    id: item.id,
                    line_item_id: item.line_item_id
                }));
                return {
                    "fulfillment_order_id": fulfillmentResponse.fulfillment_orders[0].id,
                    "line_items": fulfillmentLineItems
                };
            } catch (error) {
                log.error("error in fetching fulfillment details from shopify",error);
                return {};
            }
        }

        /**
         * Send the fulfillment request to Shopify for the corresponding order.
         * @param {string} shopifyOrderId - The Shopify order ID to fulfill/ship.
        */
        const fulfillShopifyOrder = (shopifyOrderId,fulFillItems) => {
            try {
                // Prepare the data for fulfilling the order in Shopify
                log.debug("fulfilling items: ",fulFillItems);
                let fulFillId = fetchFulFillmentDetails(shopifyOrderId);
                log.debug("fulfill id: ",fulFillId);
                let requestData = {
                    "fulfillment": {
                        "line_items_by_fulfillment_order": [
                            {
                                "fulfillment_order_id": fulFillId.fulfillment_order_id,
                                "fulfillment_order_line_items": fulFillItems
                            }
                        ]
                    }
                }
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-10/fulfillments.json`;
                let shopifyApiKey = getShopifyApiKey();
                let response = https.post({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    },
                    body: JSON.stringify(requestData)
                });
                log.debug("response: ",response);
                let responseData = JSON.parse(response);
                log.debug("parsed response: ",responseData);
            } catch (e) {
                log.error('Error Fulfilling Shopify Order', `Error occurred while fulfilling Shopify Order ID: ${shopifyOrderId}. Error: ${e.message}`);
            }
        }

        /**
         * Send the fulfillment request to Shopify for the corresponding order.
         * @param {string} shopifyOrderId - The Shopify order ID to fulfill/ship.
        */
        const getLineItemIds = (shopifyOrderId) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/orders/${shopifyOrderId}.json`;
                let shopifyApiKey = getShopifyApiKey();
                let response = https.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let orderData = JSON.parse(response.body);
                let lineItems = orderData.order.line_items;
                return lineItems;
            } catch (error) {
                log.error("error in fetching line item ids",error);
                return [];
            }
        }

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
        */
        const afterSubmit = (scriptContext) => {
            try {
                let itemFulfillmentRecord = scriptContext.newRecord;
                log.error("IF record sublist: ",itemFulfillmentRecord.sublists);
                let netsuiteOrderId = itemFulfillmentRecord.getValue('createdfrom');
                log.error("created from: ",netsuiteOrderId);
                let ifRecord = search.lookupFields({
                    type: search.Type.ITEM_FULFILLMENT,
                    id: itemFulfillmentRecord.id,
                    columns: ['status']
                });
                let lineItemsIf = [];
                let ifStatus = ifRecord.status[0].value;
                let lineCount = itemFulfillmentRecord.getLineCount({ sublistId: 'item' });
                for (let i = 0; i < lineCount; i++) {
                    let itemInternalid = itemFulfillmentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });
                    let itemIdSearch = search.lookupFields({
                        type: search.Type.INVENTORY_ITEM,
                        id: itemInternalid,
                        columns: ['itemid']
                    });
                    let itemId = itemIdSearch.itemid;
                    let quantity = itemFulfillmentRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        line: i
                    });
                    lineItemsIf.push({
                        sku: itemId,
                        quantity: quantity
                    });
                    log.debug('Line ' + i, 'Item ID: ' + itemId + ', Quantity: ' + quantity);
                }
                log.debug("items array: ",lineItemsIf);
                netsuiteOrderId = String(netsuiteOrderId);
                let shopifyOrderId = getShopifyOrderId(netsuiteOrderId);
                let shopifyOrderItems = getLineItemIds(shopifyOrderId);
                let netsuiteSkuMap = new Map(lineItemsIf.map(item => [item.sku.toLowerCase(), item]));
                let commonItems = shopifyOrderItems.filter(shopItem => netsuiteSkuMap.has(shopItem.sku.toLowerCase())).map(shopItem => {
                    let netItem = netsuiteSkuMap.get(shopItem.sku.toLowerCase());
                    return {
                        id: shopItem.id,
                        quantity: netItem.quantity
                    };
                });
                log.debug("common items: ",commonItems);
                let fulFillRes = fetchFulFillmentDetails(shopifyOrderId);
                log.debug("fulfill res: ",fulFillRes);

                let mappedArray = commonItems.map(item => {
                    let match = fulFillRes.line_items.find(ref => ref.line_item_id === item.id);
                    return match ? { id: match.id, quantity: item.quantity } : null; }).filter(Boolean);

                log.error("mapped arr",mappedArray);
                log.error("fulfillment status: ",ifStatus);
                if (ifStatus !== 'shipped') {
                    log.debug('Not Shipped', `Order ID ${netsuiteOrderId} is not marked as shipped. Skipping Shopify fulfillment.`);
                    return;
                }
                if (shopifyOrderId) {
                    fulfillShopifyOrder(shopifyOrderId,mappedArray);
                } else {
                    log.error('Shopify Order ID Missing', `No Shopify Order ID found for NetSuite Order ID: ${netsuiteOrderId}`);
                }
            } catch (error) {
                log.error('Error in afterSubmit', `Error occurred while processing Item Fulfillment: ${error.message}`);
            }
        }

        return {afterSubmit}

    });
