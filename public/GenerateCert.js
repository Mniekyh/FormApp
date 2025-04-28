const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

const pki = forge.pki;

const keys = pki.rsa.generateKeyPair(2048);
const cert = pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

const attrs = [{ name: 'commonName', value: 'localhost' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);

cert.sign(keys.privateKey);

const certPem = pki.certificateToPem(cert);
const keyPem = pki.privateKeyToPem(keys.privateKey);

fs.writeFileSync(path.join(__dirname, 'localhost.pem'), certPem);
fs.writeFileSync(path.join(__dirname, 'localhost-key.pem'), keyPem);

console.log('✅ Certyfikaty localhost.pem i localhost-key.pem wygenerowane.');
