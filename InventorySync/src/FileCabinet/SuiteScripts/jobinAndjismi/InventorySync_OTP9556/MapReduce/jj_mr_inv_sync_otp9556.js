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
* Date Created : 28-October-2025
*
* Description : This map reduce script is used to sync inventory from shopify to NetSuite
*
* REVISION HISTORY
*
* @version 1.0 OTP-9575 : 28-October-2025 : Created the initial build by JJ0363
*
*********************************************************************************************************************************/
define(['N/https', 'N/search', '../Library/jj_ns_shopify_integration.js'],
    /**
 * @param{https} https
 * @param{search} search
 * @param{library} library
 */
    (https, search, library) => {

        'use strict';

        /**
         * Retrieve the Shopify API key from script parameters
         * @returns {string} - Shopify API key from the script parameters
        */
        const getShopifyApiKey = () => {
            try {
                let scriptObj = runtime.getCurrentScript();
                return scriptObj.getParameter({
                    name: 'custscript_jj_shopify_api_tkn_opt9556' // This is the parameter ID you set in the script record
                });
            } catch (error) {
                log.error("error@getShopifyApiKey",error);
                return '';
            }
        };

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
                let inventorySearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [
                        ['isinactive', 'is', 'F'], 'AND',
                        ['custitem_jj_sync_inv_to_shopify', 'is', 'T'], 'AND',
                        [
                            ['matrixchild', 'is', 'T'], 'OR',
                            ['matrix', 'is', 'F']
                        ]
                    ],
                    columns: ['internalid', 'itemid', 'quantityonhand', 'quantityavailable']
                });
                let data = [];
                inventorySearch.run().each(result => {
                    data.push({
                        internalid: result.getValue('internalid'),
                        sku: result.getValue('itemid'),
                        quantityonhand: result.getValue('quantityonhand'),
                        quantityavailable: result.getValue('quantityavailable')
                    });
                    return true;
                });
                log.audit('Input Data Loaded', `Total items fetched: ${data.length}`);
                return data;
            } catch (error) {
                log.error('error@getInputData', error);
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
                let item = JSON.parse(mapContext.value);
                let sku = item.sku;
                let internalId = item.internalid;
                let qtyAvailable = item.quantityavailable;
                let shopifyApiKey = getShopifyApiKey();
                let shopifyVariants = library.fetchVariantProductsFromShopify(shopifyApiKey);
                let locationId = library.getLocationId();
                shopifyVariants.forEach(variant => {
                    if (variant.sku === sku && variant.inventory_item_id) {
                        mapContext.write({
                            key: variant.id,
                            value: {
                                location_id: locationId,
                                inventory_item_id: variant.inventory_item_id,
                                available: qtyAvailable,
                                sku: sku,
                                internalid: internalId,
                                variantId: variant.id
                            }
                        });
                    }
                });
            } catch (error) {
                log.error('error@map', error);
            }
        }

        /**
         * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
         * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
         * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
         *     provided automatically based on the results of the map stage.
         * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
         *     reduce function on the current group
         * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
         * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} reduceContext.key - Key to be processed during the reduce stage
         * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
         *     for processing
         * @since 2015.2
         */
        const reduce = (reduceContext) => {
            try {
                let updates = reduceContext.values.map(reduce => JSON.parse(reduce));
                let shopifyApiKey = getShopifyApiKey();
                library.updateInventory(updates,shopifyApiKey);
            } catch (error) {
                log.error('error@reduce', error);
            }
        }

        /**
         * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
         * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
         * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
         * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
         *     script
         * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
         * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
         * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
         * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
         *     script
         * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
         * @param {Object} summaryContext.inputSummary - Statistics about the input stage
         * @param {Object} summaryContext.mapSummary - Statistics about the map stage
         * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
         * @since 2015.2
         */
        const summarize = (summaryContext) => {
            try {
                log.error("error in input summary",summaryContext.inputSummary.error);
                log.error("error in map",summaryContext.mapSummary.error);
                log.error("error in reduce",summaryContext.reduceSummary.error);

                log.audit('Summary Completed', {
                    totalInput: summaryContext.inputSummary.totalKeys,
                    totalOutput: summaryContext.output.length || 0,
                    usage: summaryContext.usage,
                    concurrency: summaryContext.concurrency,
                    yields: summaryContext.yields
                });
            } catch (error) {
                log.error('error@summarize', error);
            }
        }

        return {getInputData, map, reduce, summarize}

    });
