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

        const SHOPIFY_STORE_DOMAIN = 'isf3d1-xe.myshopify.com';
        const LOCATION_ID = 75069685947;

        const trackInvSync = (shopifyCustomerId,netsuiteCustomerId,status,failureMessage) => {
            try {
                let rec = record.create({
                    type: 'customrecord_jj_track_inv_sync_otp9556',
                    isDynamic: true
                });
                rec.setValue({ fieldId: 'custrecord_jj_shopify_variant_id', value: String(shopifyCustomerId) });
                rec.setValue({ fieldId: 'custrecord_jj_ns_product_id', value: netsuiteCustomerId || '' });
                rec.setValue({ fieldId: 'custrecord_jj_inv_sync_status', value: status || '' });
                rec.setValue({ fieldId: 'custrecord_jj_failure_reason_otp9556', value: failureMessage || ''});
                let id = rec.save();
                log.audit('Sync status logged', { id, shopifyCustomerId, status, failureMessage });
            } catch (e) {
                log.error('Error logging sync record', e);
                log.error('error@logSyncAttempt', e.message);
            }
        }

        /**
         * Fetches all variant products from the Shopify store using the provided API key.
         * @param {string} shopifyApiKey - The Shopify API access token.
         * @returns {Array<Object>} Array of variant product objects from Shopify.
         */
        const fetchVariantProductsFromShopify = (shopifyApiKey) => {
            try {
                let variantEndpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/variants.json`;
                let response = https.get({
                    url: variantEndpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiKey
                    }
                });
                let shopifyData = JSON.parse(response.body);
                let shopifyVariants = shopifyData.variants || [];
                return shopifyVariants;
            } catch (error) {
                log.error("error@fetchVariantProductsFromShopify",error);
                return [];
            }
        }

        /**
         * Updates inventory levels in Shopify for the provided list of inventory update objects.
         * @param {Array<Object>} updates - Array of inventory update objects containing SKU, quantity, and inventory item ID.
         * @param {string} shopifyApiKey - The Shopify API access token.
         * @returns {void}
         */
        const updateInventory = (updates,shopifyApiKey) => {
            try {
                let inventoryEndpoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/inventory_levels/set.json`;
                updates.forEach(updateObj => {
                    try {
                        let resp = https.post({
                            url: inventoryEndpoint,
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Shopify-Access-Token': shopifyApiKey
                            },
                            body: JSON.stringify(updateObj)
                        });

                        if (resp.code >= 400) {
                            log.error('Shopify API Error', {
                                sku: updateObj.sku,
                                response: resp.body
                            });
                            trackInvSync(updateObj.variantId,updateObj.internalid,'Failed',resp.body);
                        } else {
                            log.audit('Inventory Updated Successfully', {
                                sku: updateObj.sku,
                                available: updateObj.available
                            });
                            trackInvSync(updateObj.variantId,updateObj.internalid,'Success','');
                        }

                    } catch (innerErr) {
                        log.error('Error Updating Shopify Inventory', innerErr);
                        trackInvSync(updateObj.variantId,updateObj.internalid,'Failed',innerErr.message);
                    }
                });
            } catch (error) {
                log.error("error@updateInventory",error);
            }
        }

        /**
         * Retrieves the Shopify location ID used for inventory updates.
         * @returns {number} The Shopify location ID.
         */
        const getLocationId = () => LOCATION_ID;

        return { fetchVariantProductsFromShopify, updateInventory, getLocationId }

    });
