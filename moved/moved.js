// The site moved from GitHub Pages to its own domain. GitHub Pages serves this
// folder at the old address (every path, through 404.html), and this sends each
// visitor to the same page, with the same query and anchor, at the new one.
(function (root) {
  const NEW = "https://shaken-stirred-sauteed.com";
  const OLD_PATH = "/shaken-stirred-sauteed";

  // url: the address the visitor opened (a URL or location).
  function newAddress(url) {
    const path = url.pathname === OLD_PATH || url.pathname.startsWith(`${OLD_PATH}/`)
      ? url.pathname.slice(OLD_PATH.length) || "/"
      : null;
    return path ? `${NEW}${path}${url.search}${url.hash}` : `${NEW}/`;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { newAddress };
  else {
    const to = newAddress(root.location);
    const link = root.document.getElementById("new-address");
    if (link) link.href = to;
    root.location.replace(to);
  }
})(this);
