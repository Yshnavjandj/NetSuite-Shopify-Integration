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
         * Fetches all orders from a Shopify store.
         * @param {string} shopifyApiKey - Shopify API access token.
         * @returns {Array<Object>} List of Shopify orders.
         */
        const fetchOrdersFromShopify = (shopifyApiKey) => {
            try {
                let orderFetchUrl = `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-10/orders.json?status=any`;
                let orderFetchRes = https.get({
                    url: orderFetchUrl,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let orders = JSON.parse(orderFetchRes.body).orders || [];
                return orders;
            } catch (error) {
                log.error("error in fetching orders from shopify",error);
                return [];
            }
        }

        return { fetchOrdersFromShopify }

    });
