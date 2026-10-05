/* ============================================================
   这一页唯一的任务：立刻跳到真正的界面（newtab.html）。

   为什么需要它：Chrome 给新建标签页的键盘焦点是**硬编码**交给地址栏的
   （官方文档：Override Pages 一节明说"不要依赖页面拥有键盘焦点"；
   见 crbug.com/1085779#c26）。所以直接拿 newtab.html 当覆盖页时，
   页面里再怎么 input.focus()（甚至加 autofocus），键盘输入仍然进地址栏 ——
   实测 Chromium 145：document.hasFocus() 为 true、activeElement 就是 #q，
   可打字照样落到地址栏，页面连 keydown 都收不到。

   官方绕过就是这一跳：让"新建标签页文档"立刻导航到下一个 URL，
   第二个文档不再被地址栏抢焦点，autofocus / focus() 才真的生效。
   这一跳发生在 <head> 里、body 还没解析，用户看不到中间那一帧；
   地址栏显示的也是扩展自己的 URL，不是 chrome://newtab。

   别把这一页当成"多余的文件"删掉 —— 删了输入框就又要用户先点一下。
   ============================================================ */
location.replace('newtab.html' + location.search + location.hash);
