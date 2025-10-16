/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/record', 'N/search','N/https'],
    /**
 * @param{record} record
 * @param{search} search
 * @param{https} https
 */
    (record, search, https) => {

        /**
         * Defines the Scheduled script trigger point.
         * @param {Object} scriptContext
         * @param {string} scriptContext.type - Script execution context. Use values from the scriptContext.InvocationType enum.
         * @since 2015.2
         */
        const execute = (scriptContext) => {
            const SHOPIFY_API_KEY = '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';
            const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe.myshopify.com';
            const LOCATION_ID = 75069685947;
            try {
                trackInventoryForChildItems(SHOPIFY_API_KEY,SHOPIFY_STORE_DOMAIN,LOCATION_ID);
                // trackInventoryForNormalItems(SHOPIFY_API_KEY,SHOPIFY_STORE_DOMAIN,LOCATION_ID);
            } catch (error) {
                log.error("error in setting inventory level",error);
                log.error("error in setting inventory level msg",error.message);
                log.error("error in setting inventory level cause",error.cause);
            }
        }

        //function to track inventory in NetSuite for check box enabled items.
        const trackInventoryForChildItems = (shopify_api_key,shopify_store_domain,location_id) => {
            try {
                let inventoryChildItemsSearch = search.create({
                    type: search.Type.INVENTORY_ITEM,
                    filters: [
                        ['isinactive', 'is', 'F'], 'AND',
                        ['custitem_jj_sync_inv_to_shopify', 'is', 'T'], 'AND',
                        ['matrixchild', 'is', 'T']
                    ],
                    columns: ['internalid', 'itemid','quantityonhand','quantityavailable']
                });

                let variantsData = []

                inventoryChildItemsSearch.run().each(item => {
                    let qtyAvailable = item.getValue('quantityavailable');
                    let qtyOnHand = item.getValue('quantityonhand');
                    let sku = item.getValue('itemid');

                    let variantObject = {
                        available: qtyAvailable,
                        onHand: qtyOnHand,
                        sku: sku
                    }

                    variantsData.push(variantObject);
                    
                    return true;
                });

                const variantEndPint = `https://${shopify_store_domain}/admin/api/2023-07/variants.json`;

                let productsShopify = https.get({
                    url: variantEndPint,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopify_api_key
                    }
                });

                let shopifyData = JSON.parse(productsShopify.body);
                let shopifyVariants = shopifyData.variants || [];

                let itemsForInventoryUpdate = [];
                log.error("shopify array: ",shopifyVariants);
                log.error("Netsuite array: ",variantsData);
                if(variantsData.length > 0 && shopifyVariants.length > 0) {
                    variantsData.forEach((variant) => {
                        shopifyVariants.forEach((product) => {
                            if(variant.sku === product.sku) {
                                log.error("matching item found")
                                itemsForInventoryUpdate.push({
                                    "location_id": location_id,
                                    "inventory_item_id": product.inventory_item_id,
                                    "available": variant.available
                                })
                            }
                        })
                    })
                }else {
                    log.error("Array is empty..");
                    log.error("shopify array: ",shopifyVariants);
                    log.error("Netsuite array: ",variantsData);
                }
                log.error("arr to be updated",itemsForInventoryUpdate);
                if(itemsForInventoryUpdate.length > 0) {
                    let inventoryEndpoint = `https://${shopify_store_domain}/admin/api/2025-10/inventory_levels/set.json`;
                    itemsForInventoryUpdate.forEach((body) => {
                        let inventoryUpdateResp = https.post({
                            url: inventoryEndpoint,
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Shopify-Access-Token': shopify_api_key
                            },
                            body: JSON.stringify(body)
                        })
                        if (inventoryUpdateResp.code >= 400) {
                            throw new Error(`Shopify API error: ${inventoryUpdateResp.body}`);
                        }
                    })
                }else {
                    log.error("the array is empty to update",itemsForInventoryUpdate);
                }
            } catch (error) {
                log.error("error in fn",error);
            }
        }

        const trackInventoryForNormalItems = (shopify_api_key,shopify_store_domain,location_id) => {
            let inventoryNormalItemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: [
                    ['isinactive', 'is', 'F'], 'AND',
                    ['custitem_jj_sync_inv_to_shopify', 'is', 'T'], 'AND',
                    ['matrix', 'is', 'F'], 'AND',
                    ['matrixchild', 'is', 'F']
                ],
                columns: ['internalid', 'itemid', 'quantityavailable']
            });

            inventoryNormalItemSearch.run().each(item => {
                let qtyAvailable = item.getValue('quantityavailable');
                let sku = item.getValue('itemid');

                let variantObject = {
                    available: qtyAvailable,
                    sku: sku
                }

                variantsData.push(variantObject);
                
                return true;
            });
        }

        return {execute}

    });
