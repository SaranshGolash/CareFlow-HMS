(
    function(){
    const toggles = document.querySelectorAll('.pw-toggle-icon');
    toggles.forEach(t => {
    const target = document.getElementById(t.dataset.target);
    if (!target) return;
    t.addEventListener('click', function(e){
      e.preventDefault();
      const isPwd = target.type === 'password';
      target.type = isPwd ? 'text' : 'password';
      t.classList.toggle('showing', isPwd);
    });
  });
})();