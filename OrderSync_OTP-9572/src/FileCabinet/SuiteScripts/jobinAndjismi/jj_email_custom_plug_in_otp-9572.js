function process(email) {
   
    // log all information in email
    var fromAddress = email.getFrom();
    var sender = fromAddress.getEmail();
    nlapiLogExecution('DEBUG', 'sender: ', sender);
    //  logAddress('from', fromAddress);

    //  var to = email.getTo();
    //  for (var indexTo in to) {
    //    logAddress('to', to[indexTo]);
    //  }
    //  var cc = email.getCc();
    //  for (var indexCc in cc) {
    //    logAddress('cc', cc[indexCc]);
    //  }

    // logAddress('replyTo', email.getReplyTo());
    nlapiLogExecution('DEBUG', 'sent', email.getSentDate());
    nlapiLogExecution('DEBUG', 'subject', email.getSubject());
    nlapiLogExecution('DEBUG', 'text body', email.getTextBody());
    nlapiLogExecution('DEBUG', 'html body', email.getHtmlBody());

    var scriptId = 'customscript_jj_ss_order_sync_otp9572';
    var deployId = 'customdeploy_jj_ss_order_sync_otp9572';

   nlapiScheduleScript(scriptId, deployId);

    //  var attachments = email.getAttachments();
    //  for (var indexAtt in attachments) {
    //    nlapiLogExecution('DEBUG', 'attachments', attachments[indexAtt]);
    //  }

    //  function logAddress(label, address) {
    //    if (address) {
    //      nlapiLogExecution('DEBUG', 'Email - ' + label + ': ' + address.getName() + ', ' + address.getEmail());
    //    }
    //  }
    
}
