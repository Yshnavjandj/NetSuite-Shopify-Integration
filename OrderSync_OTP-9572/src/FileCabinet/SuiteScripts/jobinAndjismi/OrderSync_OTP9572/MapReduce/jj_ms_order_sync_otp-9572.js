/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
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
* Date Created : 30-October-2025
*
* Description : This map reduce script is used to sync orders from shopify to NetSuite
*
* REVISION HISTORY
*
* @version 1.0 OTP-9572 : 30-October-2025 : Created the initial build by JJ0363
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
                    name: 'custscript_jj_shopify_api_tkn_otp9572' // This is the parameter ID you set in the script record
                });
            } catch (error) {
                log.error("error in fetching shopify api key");
                return '';
            }
        };

        let shopifyApiKey = getShopifyApiKey();

        /**
         * Retrieves a NetSuite customer internal ID based on the provided email.
         * @param {Object} customer - The customer object containing the email address.
         * @returns {string} - The internal ID of the customer if found, otherwise an empty string.
        */
        const getCustomer = (customer) => {
            try {
                let customerSearch = search.create({
                    type: search.Type.CUSTOMER,
                    filters: [['email', 'is', customer.email]],
                    columns: ['internalid','email','entityid']
                });

                let customerArray = customerSearch.run().getRange({ start: 0, end: 1 });
                return customerArray.length > 0 ? customerArray[0].getValue('internalid') : '';
            } catch (error) {
                log.error("error in getcustomer()",error);
                return '';
            }
        }

        /**
         * Creates a new customer record in NetSuite using the provided customer details.
         * @param {Object} customer - The customer object containing first name, last name, and email.
         * @returns {string} - The internal ID of the newly created customer, or an empty string on error.
        */
        const createCustomer = (customer) => {
            try {
                let rec = record.create({ type: record.Type.CUSTOMER, isDynamic: true });
                let firstName = customer.first_name;
                let lastName = customer.last_name;
                let fullName = `${firstName} ${lastName}`.trim();
                rec.setValue({ fieldId: 'entityid', value: fullName });
                rec.setValue({ fieldId: 'email', value: customer.email });
                rec.setValue({ fieldId: 'companyname', value: fullName });
                rec.setValue({ fieldId: 'subsidiary', value: 1 });
                return rec.save();
            } catch (error) {
                log.error("error in createcustomer()",error);
                return '';
            }
        }

        /**
         * Retrieves a NetSuite inventory item internal ID based on the provided item ID.
         * @param {string} itemId - The item ID to search for.
         * @returns {string} - The internal ID of the item if found, otherwise an empty string.
        */
        const getItem = (itemId) => {
            try {
                let itemSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [['isinactive', 'is', 'F'], 'AND',
                        ['itemid','is',itemId]
                    ],
                    columns: ['internalid']
                });
                let item = itemSearch.run().getRange({start: 0, end: 1});
                return item.length > 0 ? item[0].getValue('internalid') : '';
            } catch (error) {
                log.error("error in getItem()",error);
                return '';
            }
        }

        /**
         * Creates a new inventory item in NetSuite using the provided Shopify item details.
         * @param {Object} itemShopify - The Shopify item object containing SKU and price.
         * @returns {string} - The internal ID of the newly created item, or an empty string on error.
        */
        const createItem = (itemShopify) => {
            try {
                let item = record.create({
                    type: record.Type.INVENTORY_ITEM,
                    isDynamic: true
                });
                item.setValue({ fieldId: 'itemid', value: itemShopify.sku });
                item.setValue({ fieldId: 'baseprice', value: itemShopify.price });
                item.setValue({ fieldId: 'taxschedule', value: 1 });
                item.setValue({ fieldId: 'subsidiary', value: 1 });
                return item.save();
            } catch (error) {
                log.error("error in creatItem()",error);
                return '';
            }
        }

        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */
        const getInputData = (inputContext) => {
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
                log.error("orders from shopify: ",orders);
                return orders;
            } catch (error) {
                log.error("error in getinputData()",error);
                return [];
            }
        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */
        const map = (mapContext) => {
            try {
                let order = JSON.parse(mapContext.value);
                let customer = getCustomer(order.customer)
                if(!customer) {
                    customer = createCustomer(order.customer);
                }
                let lineItems = order.line_items;
                let items = []
                log.error("items: ",lineItems);
                lineItems.forEach((item) => {
                    let line_item = getItem(item.sku);
                    let itemId = line_item || createItem(item);
                    if (itemId) {
                        items.push({ id: itemId, quantity: item.quantity });
                    }
                });
                if(customer && items.length > 0) {
                    let salesOrder = record.create({ type: record.Type.SALES_ORDER, isDynamic: true });
                    salesOrder.setValue({ fieldId: 'entity', value: customer });
                    items.forEach((item,index) => {
                        salesOrder.selectNewLine({ sublistId: 'item' });
                        log.error("item id: ",item.id);
                        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item.id });
                        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.quantity });
                        salesOrder.commitLine({ sublistId: 'item' });
                    });
                    salesOrder.save();
                }else {
                    log.error("customer or item is empty...");
                }
            } catch (error) {
                log.error("error in map()",error);
            }
        }

        return {getInputData, map}

    });
