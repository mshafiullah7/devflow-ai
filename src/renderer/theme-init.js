var _t = localStorage.getItem('devflow-theme');
document.documentElement.dataset.theme = (['light','dark','midnight'].indexOf(_t) !== -1 ? _t : 'dark');
