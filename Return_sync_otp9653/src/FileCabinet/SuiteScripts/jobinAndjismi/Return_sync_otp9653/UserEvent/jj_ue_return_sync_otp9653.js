/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
/**************************************************************************************************************************************
* Training
* 
* ${OTP} : ${Onboard Training Program}
*
* 
*************************************************************************************************************************************
*
* Author: Jobin & Jismi
*
* Date Created : 03-November-2025
*
* Description : This user event script is used for the return sync from NetSuite to shopify
*
* REVISION HISTORY
*
* @version 1.0 OTP-9653 : 03-November-2025 : Created the initial build by JJ0363
*
*************************************************************************************************************************************/
define(['N/https', 'N/record', 'N/search'],
    /**
     * @param{https} https
     * @param{record} record
     * @param{search} search
     */
    (https, record, search) => {

        'use strict'

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

        /**
         * Retrieve the Shopify API key from script parameters
         * @returns {string} - Shopify API key from the script parameters
        */
        const getShopifyApiKey = () => {
            try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_jj_shopify_api_tkn_otp9653' // This is the parameter ID you set in the script record
                });
            } catch (error) {
                log.error("error in fetching shopify api key");
                return '';
            }
        };

        let shopifyApiKey = getShopifyApiKey();

        /**
         * This function gets the corresponding Shopify Order ID from a custom field.
         * @param {string} netsuiteOrderId - The NetSuite order ID to look up in the custom record.
         * @returns {string} - The Shopify Order ID or null if not found.
        */
        const shopifyOrderIdSearch = (netsuiteOrderId) => {
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
                log.error("error in searching custom record", error);
                return '';
            }
        }

        /**
         * This function fetches the Shopify Order ID based on the `createdfrom` field.
         * @param {Record} currentRecord - The current NetSuite record from which we need to extract the Shopify Order ID.
         * @returns {string} - The Shopify Order ID or null if not found.
        */
        const getShopifyOrderId = (currentRecord) => {
            try {
                let createdFromId = currentRecord.getValue('createdfrom');
                let transSearch = search.create({
                    type: search.Type.TRANSACTION,
                    filters: [['internalid', 'anyof', createdFromId]],
                    columns: ['recordtype']
                });
                let resultSet = transSearch.run();
                let firstResult = resultSet.getRange({ start: 0, end: 1 });
                let shopifyOrderId;
                if (firstResult.length > 0) {
                    let recordType = firstResult[0].getValue('recordtype');
                    log.debug('Found Record Type', 'Record type of createdfrom ID ' + createdFromId + ' is ' + recordType);
                    if (recordType === 'salesorder') {
                        shopifyOrderId = shopifyOrderIdSearch(createdFromId);
                    } else if (recordType === 'invoice') {
                        let invoiceRecord = record.load({
                            type: record.Type.INVOICE,
                            id: createdFromId
                        });
                        let salesOrderId = invoiceRecord.getValue('createdfrom');
                        if (salesOrderId) {
                            shopifyOrderId = shopifyOrderIdSearch(salesOrderId);
                        } else {
                            log.error("cannot find so id");
                        }
                    } else {
                        log.error('Unexpected Record Type', 'The createdfrom ID does not point to a Sales Order or Invoice.');
                    }
                } else {
                    log.error('Record Not Found', 'Could not find a record with createdfrom ID ' + createdFromId);
                }
                return shopifyOrderId;
            } catch (error) {
                log.error("error in fetching shopify order id");
                return '';
            }
        }

        /**
         * This function matches the returned items with Shopify items based on SKU and quantity.
         * @param {Record} currentRecord - The current NetSuite record being processed.
         * @param {Array} returningItems - An array of items being returned.
         * @returns {Object} - A matched items object that contains matched items and the Shopify Order ID.
         */
        const fetchMatchingShopifyItems = (currentRecord, returningItems) => {
            try {
                let shopifyOrderId = getShopifyOrderId(currentRecord);
                let shopifyOrderItems = getShopifyItems(shopifyOrderId);
                let matchedItems = [];
                returningItems.forEach(netsuiteItem => {
                    let match = shopifyOrderItems.find(shopifyItem => shopifyItem.sku === netsuiteItem.sku && shopifyItem.quantity >= netsuiteItem.quantity);
                    if (match) {
                        matchedItems.push({
                            line_item_id: match.id,
                            quantity: netsuiteItem.quantity,
                            amount: match.price
                        });
                    }
                });
                return { matchedItems: matchedItems, shopifyOrderId: shopifyOrderId };
            } catch (error) {
                log.error("error in matching shopify items: ", error);
                return {};
            }
        }

        /**
         * This function fetches all line items of a given Shopify order.
         * @param {string} shopifyOrderId - The Shopify Order ID to fetch the line items.
         * @returns {Array} - An array of line items.
         */
        const getShopifyItems = (shopifyOrderId) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/orders/${shopifyOrderId}.json`;
                let response = https.get({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let orderData = JSON.parse(response.body);
                let lineItems = orderData.order.line_items;
                lineItems.forEach(item => {
                    log.debug('Line Item', `ID: ${item.id}, Title: ${item.title}, Quantity: ${item.quantity}`);
                });
                return lineItems;
            } catch (error) {
                log.error("Error fetching Shopify items", error);
                return [];
            }
        }

        /**
         * This function fetches fulfillment item IDs from Shopify for a given order.
         * @param {string} shopifyOrderId - The Shopify Order ID to fetch fulfillment item IDs.
         * @returns {Object} - The Shopify fulfillment data or an empty object if an error occurs.
         */
        const getFulfillmentItemIds = (shopifyOrderId) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-10/graphql.json`;
                let requestData = `query returnableFulfillmentsQuery {
                    returnableFulfillments(orderId: "gid://shopify/Order/${shopifyOrderId}", first: 10) {
                        edges {
                            node {
                                id
                                fulfillment {
                                    id
                                }
                                returnableFulfillmentLineItems(first: 10) {
                                    edges {
                                        node {
                                            fulfillmentLineItem {
                                                id
                                            }
                                            quantity
                                        }
                                    }
                                }
                            }
                        }
                    }
                }`;
                let fulFillmentRes = https.post({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    },
                    body: JSON.stringify({ query: requestData })
                });
                log.debug("raw response body:", fulFillmentRes.body);
                let responseData = JSON.parse(fulFillmentRes.body);
                log.debug("parsed response:", responseData);
                return responseData;
            } catch (error) {
                log.error("error in fulfillment item ids:", error);
                return {};
            }
        }

        /**
         * This function creates a return in Shopify by sending the return line items.
         * @param {Object} returnItems - The object containing the matched items and the Shopify Order ID.
         */
        const createReturnInShopify = (returnItems) => {
            try {
                let shopifyOrderId = returnItems.shopifyOrderId;
                log.debug("shopify order id: ", shopifyOrderId);
                let fulFillmentLines = getFulfillmentItemIds(shopifyOrderId);
                let ids = [];
                let edges = fulFillmentLines.data.returnableFulfillments.edges;
                for (let i = 0; i < edges.length; i++) {
                    let lineItemEdges = edges[i].node.returnableFulfillmentLineItems.edges;
                    for (let j = 0; j < lineItemEdges.length; j++) {
                        let id = lineItemEdges[j].node.fulfillmentLineItem.id;
                        ids.push(id);
                    }
                }
                log.debug("fulfillment ids: ", ids);
                let filteredItems = returnItems.matchedItems.map(item => ({
                    "quantity": item.quantity
                }));
                let returnLineItems = filteredItems.map((item, i) => {
                    return `{
                        fulfillmentLineItemId: "${ids[i]}",
                        quantity: ${item.quantity},
                        returnReason: UNKNOWN,
                        customerNote: "I accidentally bought this.",
                        restockingFee: {
                        percentage: 10
                        }
                    }`;
                }).join(',');
                log.debug("return line items: ", returnLineItems);
                let requestData = `mutation ReturnRequestMutation {
                    returnRequest(
                        input: {
                            orderId: "gid://shopify/Order/${shopifyOrderId}",
                            returnLineItems: [${returnLineItems}]
                        }
                    )
                    {
                        return {
                            id
                            status
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }`;
                let createReturnRes = https.post({
                    url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-10/graphql.json`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    },
                    body: JSON.stringify({ query: requestData })
                });
                log.debug("response create return: ", createReturnRes);
                if (createReturnRes.code === 200) {
                    let responseData = JSON.parse(createReturnRes.body);
                    log.debug("Parsed Response create return: ", responseData);
                }
            } catch (error) {
                log.error("error in returning items: ", error);
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
                log.error("trigger type: ", scriptContext.type);
                if (scriptContext.type === 'approve') {
                    let currentRecord = scriptContext.newRecord;
                    log.debug("record type: ", currentRecord.type);
                    if (currentRecord.type === 'returnauthorization') {
                        let lineCount = currentRecord.getLineCount({ sublistId: 'item' });
                        let itemArr = [];
                        for (let i = 0; i < lineCount; i++) {
                            let itemInternalid = currentRecord.getSublistValue({
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
                            let quantity = currentRecord.getSublistValue({
                                sublistId: 'item',
                                fieldId: 'quantity',
                                line: i
                            });
                            itemArr.push({
                                sku: itemId,
                                quantity: quantity
                            });
                        }
                        log.debug("record is return authorization/credit memo");
                        let matchingItems = fetchMatchingShopifyItems(currentRecord, itemArr);
                        createReturnInShopify(matchingItems);
                    }
                }
            } catch (error) {
                log.error("error in aftersubmit: ", error);
            }
        }

        return { afterSubmit }

    });