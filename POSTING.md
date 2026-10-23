# How to write a post

1. Create a file in `_posts/` named `YYYY-MM-DD-short-title.md`, e.g. `_posts/2026-11-02-my-first-swim-in-a-canal.md`.
2. Start it with this header, then write in Markdown below it:

   ```markdown
   ---
   layout: post
   title: "My first swim in a canal"
   summary: "One line shown in the list of posts."
   tags: [netherlands, swimming]
   image: /assets/img/posts/canal.jpg      # optional picture at the top
   ---

   Your text here. **Bold**, *italic*, [links](https://example.com), lists, images:

   ![A canal in Utrecht](/assets/img/posts/canal.jpg)
   ```

3. Put any pictures in `assets/img/posts/`.
4. Commit and push. GitHub rebuilds the site in about a minute, and the post appears on the
   *Interests & posts* page and as "Latest post" on the home page.

You can also do this entirely on github.com: open the repository, go to the `_posts` folder,
click **Add file → Create new file**, paste the template, and click **Commit changes**.

To hide a post without deleting it, add `published: false` to its header.

Note: posts dated in the future (GitHub's clock is UTC) are not shown until that date arrives.
