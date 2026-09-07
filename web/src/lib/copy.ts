// Tiny copy-to-clipboard helper shared by the docs pages' inline scripts:
// wires every [data-copy-target] button to copy its target element's text.
export function wireCopyButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.querySelector<HTMLElement>(btn.dataset.copyTarget ?? '');
      const text = target?.textContent?.trim() ?? '';
      if (!text) return;
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
      } catch {
        const range = document.createRange();
        if (target) {
          range.selectNodeContents(target);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
        }
        btn.textContent = 'Select + copy';
      }
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });
}
