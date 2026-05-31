import http from 'http';

const req = http.request('http://localhost:3000/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', data));
});
req.write('{"password":"123"}');
req.end();
