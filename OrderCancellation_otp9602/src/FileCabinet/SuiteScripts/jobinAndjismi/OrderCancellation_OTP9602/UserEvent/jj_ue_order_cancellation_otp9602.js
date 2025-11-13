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
* Date Created : 21-October-2025
*
* Description : This user event script is used to sync order cancellation from NetSuite to shopify
*
* REVISION HISTORY
*
* @version 1.0 OTP-9575 : 21-October-2025 : Created the initial build by JJ0363
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

        /**
         * Retrieve the Shopify API key from script parameters
         * @returns {string} - Shopify API key from the script parameters
        */
        const getShopifyApiKey = () => {
            try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_jj_shopify_api_tkn_otp9602' // This is the parameter ID you set in the script record
                });
            } catch (error) {
                log.error("error in fetching shopify api key");
                return '';
            }
        };

        /**
         * Fetch the Shopify Order ID from the custom record.
         * @param {string} netsuiteOrderId - The NetSuite order ID to look up in the custom record.
         * @returns {string} - The Shopify order ID or null if not found.
        */
        const getShopifyOrderIdFromCustomRecord = (netsuiteOrderId) => {
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
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - The newly submitted record.
         * @param {Record} scriptContext.oldRecord - The old record before submission.
         * @param {string} scriptContext.type - The trigger type (create, edit, delete).
         * @since 2015.2
        */
        const afterSubmit = (scriptContext) => {
            try {
                if(scriptContext.type === scriptContext.UserEventType.CANCEL) {
                    log.error("context: ",scriptContext.type);
                    let shopifyApiKey = getShopifyApiKey();
                    let orderRecord = scriptContext.newRecord;
                    let orderId = orderRecord.id;
                    let orderIdString = String(orderId);
                    log.error("order id: ",orderId);
                    let shopifyOrderId = getShopifyOrderIdFromCustomRecord(orderIdString);
                    log.error("type order id: ",typeof(orderId));
                    let soRecord = search.lookupFields({
                        type: search.Type.SALES_ORDER,
                        id: orderId,
                        columns: ['status']
                    });
                    let soStatus = soRecord.status[0].value;
                    log.error("so status",soStatus);
                    if(soStatus !== 'cancelled') return;
                    log.error("type of shopify order id fetched from custom rec",typeof(shopifyOrderId));
                    if(shopifyOrderId) {
                        shopifyOrderId = Number(shopifyOrderId);
                        log.error("inside shopify order id");
                        if(soStatus === 'cancelled') {
                            let shopifyOrderObj = fetchOrderFromShopify(shopifyApiKey,shopifyOrderId);
                            if(shopifyOrderObj.cancelled_at !== null) return;
                            cancelShopifyOrder(shopifyApiKey,shopifyOrderId);
                        }
                    }else {
                        log.error("found no shopify order from custom record");
                        record.submitFields({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: orderId,
                            values: {
                                'custbody_jj_ord_cancel_failure_reason': 'found no shopify order from custom record'
                            }
                        });
                    }
                }
            }catch (error) {
                log.error("error in beforeSubmit",error);
                let orderRecord = scriptContext.newRecord;
                let orderId = orderRecord.id;
                record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: orderId,
                    values: {
                        'custbody_jj_ord_cancel_failure_reason': error.message
                    }
                });
            }
        }

        return {afterSubmit}

    });
