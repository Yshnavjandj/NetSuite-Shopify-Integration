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
         * This function fetches all line items of a given Shopify order.
         * @param {string} shopifyApiKey - The Shopify API token.
         * @param {string} shopifyOrderId - The Shopify Order ID to fetch the line items.
         * @returns {Array} - An array of line items.
         */
        const getShopifyItems = (shopifyApiKey,shopifyOrderId) => {
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
         * @param {string} shopifyApiKey - The Shopify API token.
         * @param {string} shopifyOrderId - The Shopify Order ID to fetch fulfillment item IDs.
         * @returns {Object} - The Shopify fulfillment data or an empty object if an error occurs.
         */
        const getFulfillmentItemIds = (shopifyApiKey,shopifyOrderId) => {
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
         * Sends a GraphQL request to Shopify to create a return.
         * @param {string} shopifyApiKey - The Shopify API access token.
         * @param {string} requestData - The GraphQL query string for creating the return.
         */
        const createReturnsInShopifyRequest = (shopifyApiKey, requestData) => {
            try {
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
            }catch (error) {
                log.error("error in creating returns in shopify",error);
            }
        }

        return {getShopifyItems, getFulfillmentItemIds, createReturnsInShopifyRequest}

    });
