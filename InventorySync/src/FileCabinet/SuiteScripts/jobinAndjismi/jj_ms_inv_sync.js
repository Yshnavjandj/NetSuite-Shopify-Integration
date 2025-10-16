/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/https', 'N/search'],
    /**
 * @param{https} https
 * @param{search} search
 */
    (https, search) => {
        'use strict';

        const SHOPIFY_API_KEY = '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';
        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe.myshopify.com';
        const LOCATION_ID = 75069685947;

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
                log.error('Error in getInputData', error);
                throw error;
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
                const item = JSON.parse(mapContext.value);
                const sku = item.sku;
                const qtyAvailable = item.quantityavailable;

                const variantEndpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/variants.json`;

                let response = https.get({
                    url: variantEndpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': SHOPIFY_API_KEY
                    }
                });

                let shopifyData = JSON.parse(response.body);
                let shopifyVariants = shopifyData.variants || [];

                shopifyVariants.forEach(variant => {
                    if (variant.sku === sku && variant.inventory_item_id) {
                        mapContext.write({
                            key: variant.id,
                            value: {
                                location_id: LOCATION_ID,
                                inventory_item_id: variant.inventory_item_id,
                                available: qtyAvailable,
                                sku: sku
                            }
                        });
                    }
                });

            } catch (error) {
                log.error('Error in map stage', error);
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
                const updates = reduceContext.values.map(v => JSON.parse(v));
                const inventoryEndpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/inventory_levels/set.json`;

                updates.forEach(updateObj => {
                    try {
                        let resp = https.post({
                            url: inventoryEndpoint,
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Shopify-Access-Token': SHOPIFY_API_KEY
                            },
                            body: JSON.stringify(updateObj)
                        });

                        if (resp.code >= 400) {
                            log.error('Shopify API Error', {
                                sku: updateObj.sku,
                                response: resp.body
                            });
                        } else {
                            log.audit('Inventory Updated Successfully', {
                                sku: updateObj.sku,
                                available: updateObj.available
                            });
                        }

                    } catch (innerErr) {
                        log.error('Error Updating Shopify Inventory', innerErr);
                    }
                });

            } catch (error) {
                log.error('Error in reduce stage', error);
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
                // log.audit('Summary Started', '--- Map/Reduce Execution Summary ---');
                // log.error("summary context: ",summaryContext.inputSummary)

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
                log.error('Error in summarize stage', error);
            }
        }

        return {getInputData, map, reduce, summarize}

    });
