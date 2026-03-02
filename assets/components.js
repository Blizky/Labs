/* ================================================================
   BLIZLAB COMPONENTS
   Contains: AppHeader, AppFooter
   ================================================================ */

class AppHeader extends HTMLElement {
  connectedCallback() {
    /* 🎨 CONFIGURATION */
    const BRAND_YELLOW = "#FFD700"; 
    const LOGO_WIDTH = "220px";
    const customTitle = this.getAttribute("app-title");
    const showTagline = this.getAttribute("show-tagline") !== "false";
    const headerMetaText = customTitle || "Free practical web-apps for creators over their deadline.";
    const showHeaderMeta = showTagline || !!customTitle;
    const MENU_APPS = [
      {
        name: "Calendar",
        href: "/calendar/",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" ry="5" fill="#0099CC"/><g transform="translate(4,4)"><path fill="#fc3" d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm12 8H5v10h14zm0-4H5v2h14z"/></g></svg>`
      },
      {
        name: "Checksy",
        href: "/checksy/",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" ry="5" fill="#0099CC"/><g transform="translate(3, 3.3) scale(1.2)"><path fill="#fc3" d="M16.02 2.036a2 2 0 0 1 1.986 1.997l.008 4.95a2 2 0 0 1-.586 1.417l-.359.359a4.5 4.5 0 1 0-6.31 6.31a2 2 0 0 1-2.79-.038L3.02 12.083a2 2 0 0 1 .002-2.83l6.682-6.665a2 2 0 0 1 1.425-.584zM13 6a1 1 0 1 0 2 0a1 1 0 0 0-2 0m3.303 9.596a3.5 3.5 0 1 0-.707.707l2.55 2.55a.5.5 0 1 0 .708-.707zM16 13.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0"/></g></svg>`
      },
      {
        name: "Chrono",
        href: "/chrono/",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" ry="5" fill="#0099CC"/><g transform="translate(8,5.5)"><path fill="#fc3" d="M9 11h2a1 1 0 0 1 0 2H8a.997.997 0 0 1-1-1V8a1 1 0 1 1 2 0zM1.869 6.861a1.5 1.5 0 1 1 2.077-1.76a8 8 0 0 1 1.126-.548A2.5 2.5 0 0 1 6.5 0h3a2.5 2.5 0 0 1 1.428 4.553q.586.231 1.126.548a1.5 1.5 0 1 1 2.077 1.76a8 8 0 1 1-12.263 0zM8 18A6 6 0 1 0 8 6a6 6 0 0 0 0 12M6.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1z"/></g></svg>`
      },
      {
        name: "Corrector",
        href: "/corrector/",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" ry="5" fill="#0099CC"/><g transform="translate(3.5, 3.0) scale(1.5)"><path fill="#fc3" d="M8.217 11.068c1.216 0 1.948-.869 1.948-2.31v-.702c0-1.44-.727-2.305-1.929-2.305-.742 0-1.328.347-1.499.889h-.063V3.983h-1.29V11h1.27v-.791h.064c.21.532.776.86 1.499.86zm-.43-1.025c-.66 0-1.113-.518-1.113-1.28V8.12c0-.825.42-1.343 1.098-1.343.684 0 1.075.518 1.075 1.416v.45c0 .888-.386 1.401-1.06 1.401zm-5.583 1.035c.767 0 1.201-.356 1.406-.737h.059V11h1.216V7.519c0-1.314-.947-1.783-2.11-1.783C1.355 5.736.75 6.42.69 7.27h1.216c.064-.323.313-.552.84-.552s.864.249.864.771v.464H2.346C1.145 7.953.5 8.568.5 9.496c0 .977.693 1.582 1.704 1.582m.42-.947c-.44 0-.845-.235-.845-.718 0-.395.269-.684.84-.684h.991v.538c0 .503-.444.864-.986.864m8.897.567c-.577-.4-.9-1.088-.9-1.983v-.65c0-1.42.894-2.338 2.305-2.338 1.352 0 2.119.82 2.139 1.806h-1.187c-.04-.351-.283-.776-.918-.776-.674 0-1.045.517-1.045 1.328v.625c0 .468.121.834.343 1.067z"/><path fill="#fc3" d="M14.469 9.414a.75.75 0 0 1 .117 1.055l-4 5a.75.75 0 0 1-1.116.061l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.908 1.907 3.476-4.346a.75.75 0 0 1 1.055-.117"/></g></svg>`
      },
      {
        name: "Octofind",
        href: "/octofind/",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="5" ry="5" fill="#0099CC"/><path fill="#fc3" d="m15.7 17.5 6-4-6-4zm-6.3 8.375q-.825.125-1.487-.387T7.15 24.15L5.825 13.225q-.1-.825.4-1.475T7.55 11l1.15-.15V19q0 1.65 1.175 2.825T12.7 23H22q-.15.6-.6 1.038t-1.1.512zM12.7 21q-.825 0-1.412-.587T10.7 19V8q0-.825.588-1.412T12.7 6h11q.825 0 1.413.588T25.7 8v11q0 .825-.587 1.413T23.7 21z"/></svg>`
      }
    ];
    const appsMenuItems = MENU_APPS.map((app) => `
      <li>
        <a href="${app.href}"${app.href.startsWith("http") ? ' target="_blank" rel="noreferrer noopener"' : ""}>
          <span class="app-menu-icon">${app.icon}</span>
          <span>${app.name}</span>
        </a>
      </li>
    `).join("");

    this.innerHTML = `
      <style>
        /* 1. COMPONENT RESET */
        :host {
          display: block;
          width: 100%;
          font-family: system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 0;
          line-height: 1.5;
          position: relative; 
          z-index: 10000;
          transform: translate3d(0, 0, 100px);
        }

        /* 2. HEADER CONTAINER */
        header {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          justify-content: space-between;
          align-items: stretch;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          min-height: 80px;
          height: 80px;
          position: relative;
          z-index: 100;
          margin: 0;
          padding: 0;   
          z-index: 99999; 
          position: relative;
          overflow: visible;
        }

/* 3. LEFT SIDE (White Background) */
.brand-section {
  flex: 2; /* Takes up 2 parts of the space (66.6%) */
  display: flex;
  align-items: center;
  padding-left: 24px; 
  background: white;
  z-index: 2;
  min-width: 0;
}

        .brand-link {
          display: inline-flex;
          align-items: center;
          line-height: 1;
          text-decoration: none;
        }

        .brand-prefix {
          color: ${BRAND_YELLOW};
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          margin-right: 6px;
        }

        .brand-logo {
          width: ${LOGO_WIDTH};
          height: auto;
          display: block;
          margin-right: 20px;
        }

        .brand-tagline {
          color: ${customTitle ? "#2f3337" : "#555"};
          font-size: ${customTitle ? "2rem" : "1.05rem"};
          line-height: ${customTitle ? "1.1" : "1.25"};
          max-width: ${customTitle ? "none" : "400px"};
          display: ${customTitle ? "block" : "none"}; 
          border-left: 1px solid #ddd;
          padding-left: 20px;
          font-weight: ${customTitle ? "600" : "400"};
          white-space: nowrap;
        }
        
        @media (min-width: 900px) {
          .brand-tagline { display: ${showHeaderMeta ? "block" : "none"}; }
        }

/* 4. RIGHT SIDE (Yellow Background) */
.nav-section {
  position: relative;
  flex: 0 0 33%; /* Explicitly set to 33% */
  align-self: stretch;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end; 
  padding-right: 28px; 
  padding-bottom: 14px;
  min-height: 80px;
  margin: 0;
  box-sizing: border-box;
  /* Ensure no leftover padding is pushing content out */
  padding-left: 0; 
}

/* 5. THE LIGHTNING SHAPE */
.nav-section::before {
  content: "";
  position: absolute;
  top: 0;
  right: 0; 
  bottom: 0;
  /* Shift the shape slightly left to overlap the white section */
  left: -40px;  
  background-color: ${BRAND_YELLOW};
  z-index: -1;
          
/* Adjusted polygon to account for the -40px offset */
  clip-path: polygon(
    40px 0%,      /* Starts at the container edge */
    100% 0%,    
    100% 100%,  
    92px 100%,    /* 40px offset + 52px original */
    46px 37%,     /* 40px offset + 6px original */
    66px 37%      /* 40px offset + 26px original */
  );
}

        /* --- MENU STYLING --- */
        .nav-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          gap: 18px; 
          font-weight: 600;
          font-size: 1rem;
          align-items: center;
        }

        .nav-list li {
          display: flex;
          align-items: center;
        }

        .nav-list li + li::before {
          content: "|";
          margin-right: 10px;
          color: rgba(0, 0, 0, 0.55);
          font-weight: 500;
        }

        .nav-link {
          text-decoration: none;
          color: #111;
          display: inline-flex;
          align-items: center;
          line-height: 1;
          font-size: 1rem;
          font-weight: 600;
          transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          background-color: transparent !important; 
          position: relative; /* Needed for z-index stacking */
        }
        
        .nav-link:hover {
          transform: scale(1.15); 
          opacity: 1; 
          background-color: transparent;
        }

        .nav-disabled {
          opacity: 0.4;
          cursor: default;
        }
        
        .nav-disabled:hover {
            transform: none; 
        }

        .nav-link--button {
          border: 0;
          background: transparent;
          color: #111;
          font: inherit;
          font-size: 1rem;
          font-weight: 600;
          padding: 0;
          margin: 0;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
        }

        .nav-link--button:hover {
          transform: scale(1.15);
        }

        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
        }

        .nav-submenu {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          list-style: none;
          margin: 0;
          padding: 8px 0;
          min-width: 220px;
          max-height: min(60vh, 420px);
          overflow-y: auto;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(0, 0, 0, 0.07);
          z-index: 10;
        }

        .nav-submenu[hidden] {
          display: none;
        }

        .nav-submenu li {
          display: block;
        }

        .nav-submenu li + li::before {
          content: none;
        }

        .nav-submenu a {
          display: grid;
          grid-template-columns: 18px 1fr;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          color: #111;
          text-decoration: none;
          font-size: 0.92rem;
          line-height: 1;
        }

        .nav-submenu a:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .app-menu-icon {
          width: 18px;
          height: 18px;
          color: #111;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .app-menu-icon img,
        .app-menu-icon svg {
          width: 18px;
          height: 18px;
          display: block;
        }

        .app-menu-icon img {
          filter: brightness(0) saturate(100%);
        }

        .app-menu-icon svg rect:first-child {
          fill: none !important;
        }

        .app-menu-icon svg [fill] {
          fill: currentColor !important;
        }

        .app-menu-icon svg [stroke] {
          stroke: currentColor !important;
        }

      </style>

      <header>
        <div class="brand-section">
          <a href="/" title="Go to Homepage" class="brand-link">
            <span class="brand-prefix" aria-hidden="true">labs.</span>
            <img src="/assets/svg/blizlab_logo_shade.svg" alt="Blizlab" class="brand-logo">
          </a>
          <div class="brand-tagline">
            ${headerMetaText}
          </div>
        </div>

        <nav class="nav-section">
          <ul class="nav-list">
            
            <li class="nav-item" data-apps-nav>
              <button class="nav-link nav-link--button" type="button" data-apps-trigger aria-haspopup="true" aria-expanded="false" aria-controls="apps-submenu">
                Apps
              </button>
              <ul id="apps-submenu" class="nav-submenu" data-apps-submenu hidden>
                ${appsMenuItems}
              </ul>
            </li>

          </ul>
        </nav>
      </header>
    `;

    const navItem = this.querySelector("[data-apps-nav]");
    const trigger = this.querySelector("[data-apps-trigger]");
    const submenu = this.querySelector("[data-apps-submenu]");
    if (!navItem || !trigger || !submenu) return;

    const closeMenu = () => {
      submenu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };

    const openMenu = () => {
      submenu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    };

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (submenu.hidden) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    this.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
        trigger.focus();
      }
    });

    document.addEventListener("click", (event) => {
      if (!navItem.contains(event.target)) closeMenu();
    });
  }
}
customElements.define('app-header', AppHeader);

/* APP FOOTER */
class AppFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer>
        <span id="footer-text">
          <img src="/assets/svg/icons/ko-fi.svg" alt="Ko-fi" class="icon-kofi" style="width: 20px; height: 20px; vertical-align: -4px; margin-right: 4px;"> 
          <a href="https://ko-fi.com/blizky" target="_blank" rel="noopener noreferrer">Buy me a Ko-fi</a> · Made by Alex with ❤️
        </span>
      </footer>
    `;
  }
}
customElements.define('app-footer', AppFooter);
