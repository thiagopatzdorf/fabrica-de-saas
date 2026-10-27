// Roda no <head>, antes da pintura, para não piscar o tema errado. Arquivo à parte porque a CSP não aceita script inline.
try{var t=localStorage.getItem("pdv-tema");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-tema",t)}catch(e){}
