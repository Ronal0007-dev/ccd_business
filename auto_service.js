const Service = require('node-windows').Service;

const svc = new Service({
    name: 'City Traders Registration System',
    description: '',
    script: 'C:\\xampp\\htdocs\\biz-registry\\app.js'
});

svc.on('install', function(){
    svc.start();
    console.log('Service installed and started')
})


svc.install();