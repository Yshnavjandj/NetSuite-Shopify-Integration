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
define(['N/https', 'N/record', 'N/search', '../Library/jj_ns_shopify_integration.js'],
 /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 * @param{library} library
 */
    (https, record, search, library) => {

        'use strict';

        /**
         * Retrieve the Shopify API key from script parameters
         * @returns {string} - Shopify API key from the script parameters
        */
        const getShopifyApiKey = () => {
           try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_jj_shopify_api_tkn_opt9650'
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
                let ifRecord = search.lookupFields({
                    type: search.Type.ITEM_FULFILLMENT,
                    id: itemFulfillmentRecord.id,
                    columns: ['status']
                });
                let ifStatus = ifRecord.status[0].value;
                if(scriptContext.type === scriptContext.UserEventType.SHIP || (scriptContext.type === scriptContext.UserEventType.CREATE && ifStatus === 'shipped') || (scriptContext.type === scriptContext.UserEventType.EDIT && ifStatus === 'shipped')) {
                    let shopifyApiKey = getShopifyApiKey();
                    log.error("IF record sublist: ",itemFulfillmentRecord.sublists);
                    let netsuiteOrderId = itemFulfillmentRecord.getValue('createdfrom');
                    log.error("created from: ",netsuiteOrderId);
                    let lineItemsIf = [];
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
                            quantity: quantity,
                            internalid: itemInternalid
                        });
                        log.debug('Line ' + i, 'Item ID: ' + itemId + ', Quantity: ' + quantity);
                    }
                    log.debug("items array: ",lineItemsIf);
                    netsuiteOrderId = String(netsuiteOrderId);
                    let shopifyOrderId = getShopifyOrderId(netsuiteOrderId);
                    let shopifyOrderItems = library.getLineItemIds(shopifyOrderId,shopifyApiKey);
                    let netsuiteSkuMap = new Map(lineItemsIf.map(item => [item.sku.toLowerCase(), item]));
                    let commonItems = shopifyOrderItems.filter(shopItem => netsuiteSkuMap.has(shopItem.sku.toLowerCase())).map(shopItem => {
                        let netItem = netsuiteSkuMap.get(shopItem.sku.toLowerCase());
                        return {
                            id: shopItem.id,
                            quantity: netItem.quantity,
                            internalid: netItem.internalid
                        };
                    });
                    log.debug("common items: ",commonItems);
                    let fulFillRes = library.fetchFulFillmentDetails(shopifyOrderId,shopifyApiKey);
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
                        library.fulfillShopifyOrder(shopifyOrderId,mappedArray,shopifyApiKey,itemFulfillmentRecord.id);
                    } else {
                        log.error('Shopify Order ID Missing', `No Shopify Order ID found for NetSuite Order ID: ${netsuiteOrderId}`);
                    }
                }
            } catch (error) {
                log.error('Error in afterSubmit', `Error occurred while processing Item Fulfillment: ${error.message}`);
            }
        }

        return {afterSubmit}

    });
