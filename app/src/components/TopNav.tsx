"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/blocks", label: "Blocks" },
  { href: "/transactions", label: "Transactions" },
  { href: "/peers", label: "Peers" },
  { href: "/node", label: "My Node" },
  { href: "/faucet", label: "Faucet" },
  { href: "/apis", label: "APIs" },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    const initial = stored ?? "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q || searching) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data?.type === "block" && data.results?.[0]?.height != null) {
        router.push(`/blocks/${data.results[0].height}`);
        setSearch("");
        return;
      }
    } catch {}
    // Fallbacks: a full block hash → its transactions, a number → block height.
    if (/^[a-f0-9]{64}$/.test(q)) router.push(`/transactions/${q}`);
    else if (/^\d+$/.test(q)) router.push(`/blocks/${q}`);
    setSearch("");
    setSearching(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-14 glass-strong z-50 flex items-center px-3 sm:px-6 gap-3 sm:gap-6">
      <Link href="/" className="flex items-center gap-2 mr-2">
        <svg className="w-[13px] h-[17px] text-white/80" viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.6386 26C13.728 26 12.945 25.7854 12.2881 25.3549C11.6312 24.9244 11.1344 24.2467 10.7962 23.3233C10.5841 22.7003 10.4359 21.9368 10.3513 21.0328C10.2668 20.1302 10.2134 19.1833 10.1926 18.1948C10.1718 17.1842 10.1497 16.2061 10.1289 15.2592C10.1289 15.0017 10.0651 14.8716 9.93897 14.8716C9.83361 14.8716 9.72695 14.9575 9.62159 15.1292C9.21967 15.8822 8.74359 16.742 8.19208 17.7097C7.66268 18.6773 7.13328 19.645 6.60388 20.6127C6.07447 21.5804 5.5984 22.4518 5.17436 23.2257C4.77243 23.9788 4.48627 24.5264 4.31717 24.871C4.10515 25.3445 3.76696 25.6449 3.3013 25.7737C2.85644 25.9246 2.29582 25.9571 1.61814 25.8699C0.940452 25.7841 0.464381 25.5149 0.188624 25.0635C-0.107945 24.5901-0.0546142 24.0958 0.347315 23.5795C0.623072 23.2348 1.01459 22.7198 1.52188 22.0317C2.03047 21.3216 2.6015 20.5269 3.23626 19.645C3.87102 18.7424 4.51749 17.8176 5.17306 16.8707C5.85075 15.9031 6.48551 14.9783 7.07865 14.0964C7.67178 13.1938 8.16867 12.4082 8.5706 11.7423C8.99464 11.0542 9.26909 10.5483 9.39657 10.2257C9.52404 9.92526 9.66062 9.591 9.8089 9.22551C9.95719 8.86003 10.0313 8.48414 10.0313 8.09655C10.0313 6.67754 9.89345 5.61231 9.61899 4.90345C9.36535 4.17249 9.01545 3.68864 8.5706 3.45193C8.14655 3.1944 7.68089 3.06433 7.1736 3.06433C6.79248 3.06433 6.38015 3.13977 5.9353 3.29065C5.51125 3.44152 5.2368 3.58069 5.10933 3.70945C4.87649 3.94617 4.65407 3.98909 4.44205 3.83822C4.23002 3.68734 4.16629 3.44022 4.25214 3.09685C4.48497 2.30085 4.90901 1.592 5.52296 0.967684C6.13951 0.322561 6.9967 0 8.09713 0C9.26129 0 10.1822 0.332967 10.8599 1.0002C11.5376 1.66743 12.0241 2.73137 12.3206 4.1933C12.6172 5.65523 12.7655 7.5906 12.7655 9.9994C12.7655 12.8374 12.8084 15.1071 12.893 16.8057C12.9775 18.5044 13.1154 19.7842 13.3053 20.6439C13.4952 21.4828 13.7606 22.0421 14.0987 22.3218C14.459 22.6014 14.9026 22.7406 15.432 22.7406C15.9614 22.7406 16.4167 22.6326 16.8615 22.418C17.3272 22.2034 17.7291 21.9238 18.0686 21.5791C18.2169 21.4074 18.386 21.3424 18.5772 21.3853C18.7671 21.4282 18.9154 21.5466 19.022 21.7404C19.1495 21.9121 19.1495 22.1384 19.022 22.418C18.5772 23.4078 17.9841 24.2571 17.2439 24.966C16.5246 25.654 15.6557 25.9987 14.6399 25.9987L14.6386 26Z"/></svg>
        <span className="text-[15px] font-bold tracking-tight">Logos</span>
        <span className="text-[9px] px-1.5 py-0.5 border border-white/10 rounded text-zinc-500 uppercase tracking-widest font-medium">Testnet</span>
      </Link>

      <div className="flex items-center gap-0.5 flex-1 md:flex-none min-w-0 overflow-x-auto no-scrollbar">
        {links.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 text-[13px] rounded-md transition-all duration-200 ${
                active
                  ? "text-white bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      <button
        onClick={toggleTheme}
        className="ml-auto p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-all duration-200"
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
          </svg>
        )}
      </button>

      <form onSubmit={handleSearch} role="search" aria-label="Site search" className="hidden md:block md:flex-1 md:max-w-sm">
        <div className="relative">
          <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search by block height, transaction hash, or slot"
            placeholder="block / tx / slot..."
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/[0.12] focus:bg-white/[0.05] transition-all duration-200 hash"
          />
        </div>
      </form>
    </nav>
  );
}
