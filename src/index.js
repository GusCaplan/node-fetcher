const browser = typeof window !== 'undefined';

let fetch;
let FormData;
if (browser) {
  fetch = window.fetch; // eslint-disable-line no-undef
  FormData = window.FormData; // eslint-disable-line no-undef
} else {
  fetch = require('node-fetch');
  FormData = require('./FormData');
}

function convertToBuffer(ab) {
  function str2ab(str) {
    const buffer = new ArrayBuffer(str.length * 2);
    const view = new Uint16Array(buffer);
    for (var i = 0, strLen = str.length; i < strLen; i++) view[i] = str.charCodeAt(i);
    return buffer;
  }

  if (typeof ab === 'string') ab = str2ab(ab);
  return Buffer.from(ab);
}

class Fetcher {
  constructor(method, url) {
    this.url = url;
    this.method = method.toUpperCase();
    this.headers = {};
    this.data = null;
  }

  set(name, value) {
    this.headers[name] = value;
    return this;
  }

  attach(name, data, filename) {
    const form = this._getFormData();
    this.set('Content-Type', `multipart/form-data; boundary=${form.boundary}`);
    form.append(name, data, filename);
    this.data = form;
    return this;
  }

  send(data) {
    if (typeof data === 'object') {
      this.set('Content-Type', 'application/json');
      this.data = JSON.stringify(data);
    } else {
      this.data = data;
    }
    return this;
  }

  end(cb) {
    // in a browser, the response is actually immutable, so we make a new one
    let response = {
      headers: {},
      text: '',
      body: {},
    };
    const data = this.data ? this.data.end ? this.data.end() : this.data : null;
    return fetch(this.url, {
      method: this.method,
      headers: this.headers,
      body: data,
    }).then((res) => {
      const ctype = res.headers.get('Content-Type');
      if (ctype === 'application/json') {
        return res.text().then((t) => {
          response.text = t;
          response.body = JSON.parse(t);
          return res;
        });
      } else {
        return (browser ? res.arrayBuffer() : res.buffer())
        .then((b) => {
          if (b instanceof ArrayBuffer) b = convertToBuffer(b);
          response.body = b;
          response.text = b.toString();
          return res;
        });
      }
    })
    .then((res) => {
      const body = response.body;
      const text = response.text;
      Object.assign(response, res);
      response.body = body;
      response.text = text;
      if (res.headers.raw) {
        for (const [name, value] of Object.entries(res.headers.raw())) response.headers[name] = value[0];
      } else {
        for (const [name, value] of res.headers.entries()) response.headers[name] = value;
      }
      if (['4', '5'].includes(response.status.toString().substr(0, 1))) return cb(response);
      return cb(null, response);
    })
    .catch((err) => {
      cb(err);
    });
  }

  then(s, f) {
    return new Promise((resolve, reject) => {
      this.end((err, res) => {
        if (err) reject(f(err));
        else resolve(s ? s(res) : null);
      });
    });
  }

  catch(f) {
    return this.then(null, f);
  }

  _getFormData() {
    if (!this._formData) this._formData = new FormData();
    return this._formData;
  }
}

const methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'];
for (const method of methods) Fetcher[method.toLowerCase()] = (url) => new Fetcher(method, url);

module.exports = Fetcher;
if (browser) window.Fetcher = Fetcher;