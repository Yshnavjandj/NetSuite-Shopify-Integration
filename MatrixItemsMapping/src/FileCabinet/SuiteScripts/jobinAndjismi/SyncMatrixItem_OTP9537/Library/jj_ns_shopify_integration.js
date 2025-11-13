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

        const createProductAndUploadImage = (shopifyApiToken, shopifyPayload , imageUrl, recordId) => {
            try {
                let url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/products.json`;
                let response = https.post({
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': shopifyApiToken
                    },
                    body: JSON.stringify(shopifyPayload)
                });
                let responseBody = JSON.parse(response.body);
                if (response.code === 201 || response.code === 200) {
                    let productId = responseBody.product.id;
                    let imageEndPoint = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2023-07/products/${productId}/images.json`;
                    let imagePayLoad = { image: { src: imageUrl } };
                    let imageResponse = https.post({
                        url: imageEndPoint,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': shopifyApiToken
                        },
                        body: JSON.stringify(imagePayLoad)
                    });
                    if (imageResponse.code === 201 || imageResponse.code === 200) {
                        log.debug('Shopify Product Created', `Product ID: ${productId}, Image uploaded successfully.`);
                    } else {
                        log.error('Image Upload Failed', `Status: ${imageResponse.code}, Body: ${imageResponse.body}`);
                        let failureResponse = `${response.body} and ${imageResponse.body}`
                        record.submitFields({
                            type: record.Type.INVENTORY_ITEM,
                            id: recordId,
                            values: {
                                'custitem_jj_failure_reason': failureResponse
                            }
                        });
                    }
                } else {
                    log.error('Shopify Product Creation Failed', `Status: ${response.code}, Body: ${response.body}`);
                }
            } catch (error) {
                log.error("error@createProductAndUploadImage",error);
            }
        }

        return {createProductAndUploadImage}

    });
