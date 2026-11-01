-- A recipe's image is a path the app puts in the URL it loads the image
-- from, sent with the user's token, and teammates' apps load it too. A path
-- with ".." segments led those requests to other endpoints instead, like
-- delete-account. Current apps only follow paths they could have uploaded;
-- this keeps out what older apps would still follow: "..", percent escapes,
-- backslashes and control characters (URL parsers drop tabs and newlines,
-- so ".<tab>." still becomes ".."). Images saved before Storage are base64
-- data URIs, which may be split into lines, so they have their own pattern.

UPDATE public.recipes SET image = ''
WHERE image ~ '\.\.|%|\\|[[:cntrl:]]'
  AND image !~ '^data:image/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=[:space:]]*$';

ALTER TABLE public.recipes
  ADD CONSTRAINT chk_image_safe_path CHECK (
    image !~ '\.\.|%|\\|[[:cntrl:]]'
    OR image ~ '^data:image/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=[:space:]]*$'
  );
