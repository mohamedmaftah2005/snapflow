/**
 * Anti-flash theme bootstrap. Runs synchronously before first paint so the
 * correct theme class is present when React hydrates. Mirrors
 * resolveTheme() in lib/theme.ts — keep the two in sync.
 */
const INIT = `(function(){try{var s=localStorage.getItem("sf_theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: INIT }} />;
}
