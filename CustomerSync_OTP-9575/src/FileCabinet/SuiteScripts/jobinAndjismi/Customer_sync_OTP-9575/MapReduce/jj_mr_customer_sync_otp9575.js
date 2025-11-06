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
* Description : This map reduce script is used to sync customers from shopify to NetSuite
*
* REVISION HISTORY
*
* @version 1.0 OTP-9575 : 30-October-2025 : Created the initial build by JJ0363
*
*********************************************************************************************************************************/
define(['N/https', 'N/record', 'N/search', '../Library/jj_netsuite_shopify_integration_library.js'],
    /**
     * @param{https} https
     * @param{record} record
     * @param{search} search
     * @param{library} library
     */
    (https, record, search, library) => {

        'use strict'

        let customersFromShopify = library.customersFromShopify();
        let netSuiteCustomers = library.netSuiteCustomers();

        /**
         * Find an existing customer in NetSuite by email.
         * @param {string} email - Customer's email address to search for in NetSuite.
         * @returns {Object} - Customer record object if found, otherwise null.
        */
        const findExistingCustomerInNetSuite = (email) => {
            try {
                let customerSearch = search.create({
                    type: search.Type.CUSTOMER,
                    filters: [['email', 'is', email], 'AND', ['isinactive', 'is', 'F']],
                    columns: ['internalid']
                });
                let resultSet = customerSearch.run();
                let results = resultSet.getRange({ start: 0, end: 1 });
                if (results && results.length > 0) {
                    return { internalId: results[0].getValue('internalid') };
                }
                return {};
            } catch (error) {
                log.error("Error in finding existing customer in NetSuite", error);
                return {}; 
            }
        }

        /**
         * Update an existing customer record in NetSuite.
         * @param {Object} existingCustomer - The existing customer object.
         * @param {Object} customerData - The updated customer data.
         */
        const updateCustomerInNetSuite = (existingCustomer, customerData) => {
            try {
                let customerRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: existingCustomer.internalId
                });
                let isUpdated = false;
                if (customerRecord.getValue('email') !== customerData.email) {
                    customerRecord.setValue('email', customerData.email || '');
                    isUpdated = true;
                }
                if (customerRecord.getValue('phone') !== customerData.phone) {
                    customerRecord.setValue('phone', customerData.phone  || '');
                    isUpdated = true;
                }
                if (customerRecord.getValue('address') !== customerData.address) {
                    customerRecord.setValue('address', customerData.address  || '');
                    isUpdated = true;
                }
                if (customerRecord.getValue('city') !== customerData.city) {
                    customerRecord.setValue('city', customerData.city  || '');
                    isUpdated = true;
                }
                if (customerRecord.getValue('state') !== customerData.state) {
                    customerRecord.setValue('state', customerData.state  || '');
                    isUpdated = true;
                }
                if (customerRecord.getValue('zipcode') !== customerData.zip) {
                    customerRecord.setValue('zipcode', customerData.zip  || '');
                    isUpdated = true;
                }
                if (customerRecord.getValue('country') !== customerData.country) {
                    customerRecord.setValue('country', customerData.country);
                    isUpdated = true;
                }
                if (isUpdated) {
                    let updatedCustomer = customerRecord.save();
                    log.debug('Updated Customer in NetSuite', 'Customer ID: ' + updatedCustomer);
                }
            } catch (e) {
                log.error('Error in Updating Customer', 'Error updating customer: ' + e.message);
            }
        }

        /**
         * Create a new customer record in NetSuite.
         * @param {Object} customerData - The customer data to create in NetSuite.
         */
        const createCustomerInNetSuite = (customerData) => {
            try {
                let newCustomer = record.create({
                    type: record.Type.CUSTOMER
                });
                let customerName = `${customerData.first_name} ${customerData.last_name}`
                newCustomer.setValue('entityid', customerName);
                newCustomer.setValue('companyname', customerName);
                newCustomer.setValue('email', customerData.email);
                newCustomer.setValue('phone', customerData.phone  || '');
                newCustomer.setValue('address', customerData.address  || '');
                newCustomer.setValue('city', customerData.city  || '');
                newCustomer.setValue('state', customerData.state  || '');
                newCustomer.setValue('zipcode', customerData.zip  || '');
                newCustomer.setValue('country', customerData.country  || '');
                newCustomer.setValue('subsidiary', 1);
                let newCustomerId = newCustomer.save();
                log.debug('Created Customer in NetSuite', 'Customer ID: ' + newCustomerId);
            } catch (e) {
                log.error('Error in Creating Customer' ,e);
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
                // let shopifyCustomers = customersFromShopify();
                // let netSuiteCustomersData = netSuiteCustomers();
                let customerData = [];
                customersFromShopify.forEach(shopifyCustomer => {
                    let existingCustomer = netSuiteCustomers.find(netsuiteCustomer => netsuiteCustomer.email === shopifyCustomer.email);
                    if (existingCustomer) {
                        customerData.push({
                            action: 'update',
                            customerId: existingCustomer.internalId,
                            shopifyCustomerData: shopifyCustomer
                        });
                    } else {
                        customerData.push({
                            action: 'create',
                            shopifyCustomerData: shopifyCustomer
                        });
                    }
                });
                return customerData;
            } catch (error) {
                log.error("error in getInputData()", error)
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
                let customerData = JSON.parse(mapContext.value);
                let existingCustomer = findExistingCustomerInNetSuite(customerData.shopifyCustomerData.email);
                if (existingCustomer) {
                    updateCustomerInNetSuite(existingCustomer, customerData.shopifyCustomerData);
                } else {
                    createCustomerInNetSuite(customerData.shopifyCustomerData);
                }
            } catch (e) {
                log.error('Error in Mapping', 'Error processing customer ID: ' + customerData.internalId + ', Error: ' + e.message);
            }
        }

        return { getInputData, map }

    });
