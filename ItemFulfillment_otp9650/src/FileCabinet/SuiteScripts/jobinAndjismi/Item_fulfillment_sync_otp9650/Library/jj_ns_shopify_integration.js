/**
 * @NApiVersion 2.1
 */
define(['N/https', 'N/record', 'N/search'],
    /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 */
    (https, record, search) => {

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

        /**
         * Send the fulfillment request to Shopify for the corresponding order.
         * @param {string} shopifyOrderId - The Shopify order ID to fulfill/ship.
        */
        const fetchFulFillmentDetails = (shopifyOrderId,shopifyApiKey) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/orders/${shopifyOrderId}/fulfillment_orders.json`;
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
        const fulfillShopifyOrder = (shopifyOrderId,fulFillItems,shopifyApiKey,recordId) => {
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
                let response = https.post({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    },
                    body: JSON.stringify(requestData)
                });
                log.debug("response: ",response);
                if(response.code >= 400) {
                    record.submitFields({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: recordId,
                        values: {
                            'custbody_jj_failure_reason_otp9650': response.body
                        }
                    });
                }else {	
                    let internalIds = fulFillItems.map((item) => item.internalid);
                    record.submitFields({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: recordId,
                        values: {
                            'custbody_jj_fulfilled_items_shopify': internalIds
                        }
                    });
                }
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
        const getLineItemIds = (shopifyOrderId,shopifyApiKey) => {
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
                return lineItems;
            } catch (error) {
                log.error("error in fetching line item ids",error);
                return [];
            }
        }

        return {fetchFulFillmentDetails, fulfillShopifyOrder, getLineItemIds}

    });
