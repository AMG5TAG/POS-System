/* Price columns for the pizzashed menu boards.
 *
 * Prices are typed as plain text ("M$20 L$25 F$29", "10P $17.90<br>20P $29.90").
 * Once the fonts have loaded this lines them up, so nothing needs measuring by
 * hand when a price changes:
 *   - every price in a column (a <div class="col">, or a section on its own)
 *     starts at the same place;
 *   - the parts of a price line up from row to row: among the price lines
 *     with the same number of parts, the first part ("M$20", "10P") is as
 *     wide as the widest first part, and so on. The font's digits differ in
 *     width ("1" is narrower than "0"), so without this "L$26" would not sit
 *     over "L$22". ("CHICKEN $5" has two parts and "M$27 L$32 F$38" three,
 *     so one never widens the other.)
 */
(function () {
  function layout() {
    document.querySelectorAll(".stage > .col, .stage > .menu").forEach(function (group) {
      var prices = Array.prototype.slice.call(group.querySelectorAll(".price"));
      if (!prices.length) return;

      prices.forEach(function (p) {
        if (p.dataset.parts) return;
        p.dataset.parts = "1";
        p.innerHTML = p.innerHTML
          .split(/<br\s*\/?>/i)
          .map(function (line) {
            return '<span class="price-line">' + line.trim().split(/\s+/).map(function (t) {
              return '<span class="price-part">' + t + "</span>";
            }).join("") + "</span>";
          })
          .join("");
      });

      // Widest part at each position, then size every part to it.
      // (offsetWidth is the unscaled layout width, so the board's fit-to-screen
      // scale doesn't affect it.)
      var widths = {};
      var key = function (line, i) { return line.children.length + ":" + i; };
      group.querySelectorAll(".price-line").forEach(function (line) {
        Array.prototype.forEach.call(line.children, function (part, i) {
          part.style.width = "";
          widths[key(line, i)] = Math.max(widths[key(line, i)] || 0, part.offsetWidth);
        });
      });
      group.querySelectorAll(".price-line").forEach(function (line) {
        Array.prototype.forEach.call(line.children, function (part, i) {
          part.style.width = widths[key(line, i)] + "px";
        });
      });

      // Every price box as wide as the widest, so they all start together.
      var widest = 0;
      prices.forEach(function (p) { p.style.width = ""; widest = Math.max(widest, p.offsetWidth); });
      prices.forEach(function (p) { p.style.width = widest + "px"; });
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout); else addEventListener("load", layout);
})();
