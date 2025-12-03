// ---------- Configurações ----------
const OWNER_EMAIL = 'fornoeencanto@gmail.com';
const SPREADSHEET_NAME = 'Menu Natal Especial'; // apenas referência

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Menu Natal Especial');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------- Produtos ----------------
function getProducts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Products');
  if (!sheet) {
    sheet = ss.insertSheet('Products');
    sheet.getRange(1,1,1,3).setValues([['Name','Price','ImageURL']]);
  }
  const data = sheet.getDataRange().getValues();
  const products = [];
  for (let i=1;i<data.length;i++){
    const row = data[i];
    if (!row[0]) continue;
    products.push({
      name: row[0].toString(),
      price: parseFloat(row[1]) || 0,
      image: row[2] ? row[2].toString() : ''
    });
  }
  return products;
}

// Popular produtos automaticamente
function ensureProducts(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Products');
  if (!sheet) sheet = ss.insertSheet('Products');
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) return 'Products sheet already has data.';

  const rows = [
    ['Name','Price','ImageURL'],
    ['KIT DECORE VOCÊ MESMO',15,'https://drive.google.com/uc?export=view&id=19HoH8leFilfuZXjsBOPk97ZwCftVUe0y'],
    ['GRATIDÃO CLÁSSICO',3,'https://drive.google.com/uc?export=view&id=1USjJ6qdRgVWEauJPsOuq2VuelMdSbxbw'],
    ['BISCOITO INDIVIDUAL',6,'https://drive.google.com/uc?export=view&id=1LZjbBQuxV5ODhNfFfGWmlwFRbP7G-VGT'],
    ['INDIVIDUAL PROMOCIONAL',5,'https://drive.google.com/uc?export=view&id=1FKTU9yjcI9bfHRhZKfR9TES-Zyun98LJ'],
    ['KIT NATAL',30,'https://drive.google.com/uc?export=view&id=1NTSDqF8BejsmiDcu0jVwZuUAdAfSX2uk'],
    ['KIT PRESÉPIO',48,'https://drive.google.com/uc?export=view&id=19ZzgNxg3wrhvWCe9jjPerT5tRBzz5t7a'],
    ['SAÚDE BUCAL',3,'https://drive.google.com/uc?export=view&id=1kQ01OE4a9vxtTlIaQtZZnQdgKmyNPsj8']
  ];

  sheet.clear();
  sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows);

  if (!ss.getSheetByName('Orders')){
    ss.insertSheet('Orders');
    const os = ss.getSheetByName('Orders');
    os.getRange(1,1,1,8).setValues([[
      'Timestamp','OrderID','CustomerName','CustomerPhone',
      'CustomerEmail','ItemsJSON','Total','Status'
    ]]);
  }

  return 'Products populated.';
}

// ---------------- Envio do Pedido ----------------
function submitOrder(order){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Orders');
  const timestamp = new Date();
  const orderId = 'PED' + Utilities.getUuid().slice(0,8).toUpperCase();
  const itemsJson = JSON.stringify(order.items);

  sheet.appendRow([
    timestamp, orderId, order.customerName,
    order.customerPhone || '',
    order.customerEmail || '',
    itemsJson,
    order.total,
    'Recebido'
  ]);

  const invoiceHtml = createInvoiceHtml(order, orderId, timestamp);

  try {
    const blob = Utilities.newBlob(invoiceHtml, 'text/html', 'pedido.html')
  .getAs('application/pdf')
  .setName('Pedido_'+orderId+'.pdf');



    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: 'Novo Pedido - ' + orderId,
      body: 'Novo pedido recebido. PDF em anexo.',
      attachments: [blob]
    });

    if (order.customerEmail){
      MailApp.sendEmail({
        to: order.customerEmail,
        subject: 'Confirmação de Pedido - ' + orderId,
        body: 'Obrigado pelo pedido! Segue orçamento em PDF.',
        attachments: [blob]
      });
    }

    return {status: 'ok', orderId: orderId};
  } catch(err){
    return {status: 'error', message: err.toString()};
  }
}

// ----------- HTML do PDF -----------
function createInvoiceHtml(order, orderId, timestamp){
  const header = '<h2>Menu Natal Especial - Pedido</h2>';
  const meta = '<p><strong>Pedido:</strong> ' + orderId + ' | <strong>Data:</strong> ' + timestamp.toLocaleString() + '</p>';
  const customer =
    '<p><strong>Nome:</strong> '+sanitize(order.customerName)+
    '<br><strong>Telefone:</strong> '+sanitize(order.customerPhone)+
    (order.customerEmail ? '<br><strong>E-mail:</strong> '+sanitize(order.customerEmail) : '')+
    '</p>';

  // ---- Tabela ----
  let table = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:25px;">
      <tr>
        <th style="border-bottom:1px solid #ccc;text-align:left;padding:5px">Produto</th>
        <th style="border-bottom:1px solid #ccc;text-align:right;padding:5px">Qtd</th>
        <th style="border-bottom:1px solid #ccc;text-align:right;padding:5px">Preço</th>
        <th style="border-bottom:1px solid #ccc;text-align:right;padding:5px">Subtotal</th>
      </tr>
  `;

  order.items.forEach(it=>{
    const subtotal = (it.qty * it.price).toFixed(2);
    table += `
      <tr>
        <td style="padding:5px">${sanitize(it.name)}</td>
        <td style="text-align:right;padding:5px">${it.qty}</td>
        <td style="text-align:right;padding:5px">R$ ${it.price.toFixed(2)}</td>
        <td style="text-align:right;padding:5px">R$ ${subtotal}</td>
      </tr>
    `;
  });

  table += `
      <tr>
        <td colspan="3" style="text-align:right;font-weight:bold;padding:5px">Total</td>
        <td style="text-align:right;font-weight:bold;padding:5px">R$ ${order.total.toFixed(2)}</td>
      </tr>
    </table>
  `;

  // ---- Mensagem abaixo da tabela ----
  const message = `
    <p style="margin-top:20px;font-size:14px;">
      <strong>Seu pedido foi gerado com sucesso!</strong><br>
      Nossa equipe entrará em contato pelo número informado.
    </p>
    <p style="font-size:14px;">Obrigado.<br>Equipe Forno e Encanto</p>
  `;

  return `
    <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;padding:20px;">
        ${header}
        ${meta}
        ${customer}
        ${table}
        ${message}
      </body>
    </html>
  `;
}



function sanitize(str){
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
