import { copy } from './ui/copy';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `<h1>${copy.title}</h1><p>${copy.placeholder}</p>`;
}
