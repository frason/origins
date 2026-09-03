import { JSDOM } from 'jsdom';
const dom = new JSDOM('', { url: 'http://localhost' });
console.log(typeof dom.window.localStorage);
try {
  dom.window.localStorage.setItem('a', 'b');
  console.log('set ok', dom.window.localStorage.getItem('a'));
} catch (e) {
  console.log('ERR', e.message);
}
