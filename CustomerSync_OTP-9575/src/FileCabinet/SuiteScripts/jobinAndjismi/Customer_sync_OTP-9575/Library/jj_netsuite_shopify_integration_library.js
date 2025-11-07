/**
 * @NApiVersion 2.1
 */
define(['N/https', 'N/record', 'N/search', 'N/runtime'],
    /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 * @param{search} runtime
 */
    (https, record, search, runtime) => {

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

        /**
         * This function checks if the customer already exists in Shopify by matching the email.
         * @param {string} email - The email address of the customer to search for in Shopify.
         * @returns {number|NaN} - Shopify customer ID if found, null if not found.
        */
        const getShopifyCustomerId = (email,shopifyApiKey) => {
            try {
                let response = https.get({
                    url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/customers/search.json?email=${email}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let responseData = JSON.parse(response.body);
                log.error("shopify res: ",responseData);
                if (responseData.customers && responseData.customers.length > 0) {
                    return responseData.customers[0].id;
                }
                return NaN;
            } catch (error) {
                log.error("error in fetching shopify customers: ",error)
                return NaN;
            }
        }

        /**
         * Fetch customers from Shopify.
         * @returns {Array} - List of customers fetched from Shopify.
        */
        const customersFromShopify = (shopifyApiKey) => {
            try {
                let response = https.get({
                    url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/customers.json`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let shopifyCustomers = JSON.parse(response.body).customers || [];
                log.error("shopify customers: ", shopifyCustomers);
                return shopifyCustomers;
            } catch (error) {
                log.error("Error fetching Shopify customers", error);
                return [];
            }
        }

        /**
         * Fetch active customers from NetSuite.
         * @returns {Array} - List of active customers in NetSuite.
        */
        const netSuiteCustomers = () => {
            try {
                let customerSearch = search.create({
                    type: search.Type.CUSTOMER,
                    filters: [['isinactive', 'is', 'F']],
                    columns: ['internalid', 'entityid', 'email', 'phone', 'address', 'city', 'state', 'zipcode', 'country']
                });
                let searchResult = [];
                customerSearch.run().each(function(result) {
                    searchResult.push({
                        internalId: result.getValue('internalid'),
                        name: result.getValue('entityid'),
                        email: result.getValue('email'),
                        phone: result.getValue('phone'),
                        address: result.getValue('address'),
                        city: result.getValue('city'),
                        state: result.getValue('state'),
                        zip: result.getValue('zipcode'),
                        country: result.getValue('country')
                    });
                    return true;
                });
                return searchResult;
            } catch (error) {
                log.error("Error fetching NetSuite customers", error);
                return [];
            }
        }

        return { getShopifyCustomerId, customersFromShopify, netSuiteCustomers }

    });
