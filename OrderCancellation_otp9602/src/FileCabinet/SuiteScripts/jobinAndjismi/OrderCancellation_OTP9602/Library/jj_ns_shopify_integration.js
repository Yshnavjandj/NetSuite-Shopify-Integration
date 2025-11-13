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
         * Send the cancellation request to Shopify for the corresponding order.
         * @param {string} shopifyOrderId - The Shopify order ID to cancel.
         */
        const cancelShopifyOrder = (shopifyApiKey,shopifyOrderId) => {
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
        const fetchOrderFromShopify = (shopifyApiKey,orderId) => {
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

        return { fetchOrderFromShopify, cancelShopifyOrder }

    });
