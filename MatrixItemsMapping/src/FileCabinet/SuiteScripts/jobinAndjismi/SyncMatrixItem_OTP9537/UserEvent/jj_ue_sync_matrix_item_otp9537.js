/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
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
* Date Created : 8-October-2025
*
* Description : This user event script is used to sync matrix items from NetSuite to shopify
*
* REVISION HISTORY
*
* @version 1.0 OTP-9537 : 8-October-2025 : Created the initial build by JJ0363
*
*********************************************************************************************************************************/
define(['N/https', 'N/record', 'N/search', '../Library/jj_ns_shopify_integration.js'],
    /**
 * @param{https} https
 * @param{record} record
 * @param{search} search
 */
    (https, record, search, library) => {

        'use strict'

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
                if (scriptContext.type !== scriptContext.UserEventType.CREATE) {
                    return;
                }
                let newRecord = scriptContext.newRecord;
                let parentId = newRecord.id;
                let parentName = newRecord.getValue({ fieldId: 'itemid' });
                let imageId = newRecord.getValue({ fieldId: 'storedisplayimage' });
                let imageUrl = '';
                if (imageId) {
                    let imageFileObj = file.load({ id: imageId });
                    imageUrl = imageFileObj.url;
                    imageUrl = `https://${runtime.accountId.toLowerCase()}.app.netsuite.com${imageUrl}`;
                }
                let variantSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [
                        ['parent', 'anyof', parentId], 'AND',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: ['itemid', 'internalid', 'custitem10', 'custitem11', 'baseprice', 'quantityavailable']
                });
                let matrixChilds = [];
                let optionValuesColor = new Set();
                let optionValuesSize = new Set();
                variantSearch.run().each(variant => {
                    let sku = variant.getValue('itemid');
                    let color = variant.getText('custitem10');
                    let size = variant.getText('custitem11');
                    let price = parseFloat(variant.getValue('baseprice')) || 0;
                    let quantity = parseInt(variant.getValue('quantityavailable')) || 0;
                    optionValuesColor.add(color);
                    optionValuesSize.add(size);
                    matrixChilds.push({
                        option1: color,
                        option2: size,
                        price: price.toFixed(2),
                        sku: sku,
                        inventory_quantity: quantity
                    });
                    return true;
                });
                let shopifyPayload = {
                    product: {
                        title: parentName,
                        options: [
                            { name: "Color", values: Array.from(optionValuesColor) },
                            { name: "Size", values: Array.from(optionValuesSize) }
                        ],
                        variants: matrixChilds
                    }
                };
                let shopifyApiToken = runtime.getCurrentScript().getParameter({ name: 'custscript_jj_shopify_access_tkn' });
                library.createProductAndUploadImage(shopifyApiToken,shopifyPayload,imageUrl);
            } catch (e) {
                log.error('error@afterSubmit', e);
            }
        };

        return { afterSubmit }

    });
