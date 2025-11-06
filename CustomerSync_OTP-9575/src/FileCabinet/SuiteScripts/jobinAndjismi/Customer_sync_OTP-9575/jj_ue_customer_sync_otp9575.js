/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
/**********************************************************************************************************************************
* Training
* 
* ${OTP} : ${Onboard Training Program}
*
* 
**********************************************************************************************************************************
*
* Author: Jobin & Jismi
*
* Date Created : 30-October-2025
*
* Description : This user event script is used to sync customers from NetSuite to shopify
*
* REVISION HISTORY
*
* @version 1.0 OTP-9575 : 30-October-2025 : Created the initial build by JJ0363
*
*
*********************************************************************************************************************************/
define(['N/https', 'N/record', 'N/search'],
    /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 */
    (https, record, search) => {

        'use strict'

        const SHOPIFY_API_KEY = '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';
        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe';

        /**
         * This function checks if the customer already exists in Shopify by matching the email.
         * @param {string} email - The email address of the customer to search for in Shopify.
         * @returns {number|null} - Shopify customer ID if found, null if not found.
         */
        const getShopifyCustomerId = (email) => {
            try {
                let response = https.get({
                    url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/customers/search.json?email=${email}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': SHOPIFY_API_KEY
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
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {
            try {
                let customerRecord = scriptContext.newRecord;
                log.error('customer record: ',customerRecord);
                let customerId = customerRecord.id;
                let customerName = customerRecord.getValue('entityid');
                let customerEmail = customerRecord.getValue('email');
                let customerPhone = customerRecord.getValue('phone');
                let customerAddress = customerRecord.getValue('address') || '';
                let customerCity = customerRecord.getValue('city') || '';
                let customerState = customerRecord.getValue('state') || '';
                let customerZip = customerRecord.getValue('zipcode') || '';
                let customerCountry = customerRecord.getValue('country') || '';
                let shopifyCustomerId = getShopifyCustomerId(customerEmail);
                log.error("customer email: ",customerEmail);
                log.error("shopify customer id: ",shopifyCustomerId);
                let shopifyCustomerData = {
                    customer: {
                        "first_name": customerName.split(' ')[0],
                        "last_name": customerName.split(' ')[1],
                        "email": customerEmail,
                        "phone": customerPhone,
                        "addresses": [{
                            "address1": customerAddress,
                            "city": customerCity,
                            "state": customerState,
                            "zip": customerZip,
                            "country": customerCountry
                        }]
                    }
                };
                log.error("shopify customer data: ",shopifyCustomerData);
                if (shopifyCustomerId) {
                    try {
                        log.error("inside if condition");
                        let updateResponse = https.put({
                            url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/customers/${shopifyCustomerId}.json`,
                            headers: {
                                'X-Shopify-Access-Token': SHOPIFY_API_KEY,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(shopifyCustomerData)
                        });
                        let updateResponseData = JSON.parse(updateResponse.body);
                        log.error('Updated Shopify Customer', `Customer ID: ${shopifyCustomerId} updated successfully.`);
                        log.error("customer updated response",updateResponseData);
                    } catch (error) {
                        log.error("error in updating shopify customer",error);
                    }
                } else {
                    try {
                        log.error("inside else condition");
                        let createResponse = https.post({
                            url: `https://${SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2023-01/customers.json`,
                            headers: {
                                'X-Shopify-Access-Token': SHOPIFY_API_KEY,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(shopifyCustomerData)
                        });
                        let createdRes = JSON.parse(createResponse.body);
                        log.error('Created Shopify Customer',createdRes);
                    } catch (error) {
                        log.error("error in creating shopify customer",error);
                    }
                }
            } catch (error) {
                log.error("error in aftersubmit: ",error);
            }
        }

        return {afterSubmit}

    });
