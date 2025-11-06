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

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

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

        let shopifyApiKey = getShopifyApiKey();

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
         * Send the cancellation request to Shopify for the corresponding order.
         * @param {string} shopifyOrderId - The Shopify order ID to cancel.
         */
        const cancelShopifyOrder = (shopifyOrderId) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/orders/${shopifyOrderId}/cancel.json`;
                let response = https.post({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    },
                    body: JSON.stringify({ "reason": "customer_cancelled" })
                });
                let responseData = JSON.parse(response.body);
                if (responseData.order && responseData.order.cancelled_at !== null) {
                    log.error('Shopify Order Cancelled', `Order ID ${shopifyOrderId} successfully cancelled in Shopify.`);
                } else {
                    log.error('Shopify Order Cancellation Failed', `Failed to cancel Shopify Order ID: ${shopifyOrderId}. Response: ${response.body}`);
                }
            } catch (e) {
                log.error('Error Cancelling Shopify Order', `Error occurred while cancelling Shopify Order ID: ${shopifyOrderId}. Error: ${e.message}`);
            }
        }

        /**
         * Fetches a specific order from Shopify using the provided order ID.
         * @param {string} orderId - The ID of the Shopify order to retrieve.
         * @returns {Object} - The Shopify order object if found, otherwise an empty object.
         */
        const fetchOrderFromShopify = (orderId) => {
            try {
                let shopifyOrdersRes = https.get({
                    url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-10/orders/${orderId}.json`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                })
                let shopifyOrder = JSON.parse(shopifyOrdersRes.body).order || {};
                return shopifyOrder;
            } catch (error) {
                log.error("error in fetching shopify orders.")
                return {};
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
                log.error("context: ",scriptContext);
                let orderRecord = scriptContext.newRecord;
                let orderId = orderRecord.id;
                let orderIdString = String(orderId);
                log.error("order id: ",orderId);
                let shopifyOrderId = getShopifyOrderIdFromCustomRecord(orderIdString);
                log.error("type order id: ",typeof(orderId));
                // let cancelledStatus = orderRecord.status;
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
                        let shopifyOrderObj = fetchOrderFromShopify(shopifyOrderId);
                        if(shopifyOrderObj.cancelled_at !== null) return;
                        cancelShopifyOrder(shopifyOrderId);
                    }
                }else {
                    log.error("found no shopify order from custom record");
                }
            } catch (error) {
                log.error("error in beforeSubmit",error);
            }
        }

        return {afterSubmit}

    });
