function process(email) {
    try {
        var fromAddress = email.getFrom();
        var sender = fromAddress.getEmail();
        nlapiLogExecution('DEBUG', 'sender: ', sender);
        nlapiLogExecution('DEBUG', 'sent', email.getSentDate());
        nlapiLogExecution('DEBUG', 'subject', email.getSubject());
        nlapiLogExecution('DEBUG', 'text body', email.getTextBody());
        nlapiLogExecution('DEBUG', 'html body', email.getHtmlBody());
        var scriptId = 'customscript_jj_ss_order_sync_otp9572';
        var deployId = 'customdeploy_jj_ss_order_sync_otp9572';
    
       nlapiScheduleScript(scriptId, deployId);
    } catch (error) {
        nlapiLogExecution('ERROR', 'error in email plug in', error);
        nlapiLogExecution('ERROR', 'error msg', error.message);
    }
}
