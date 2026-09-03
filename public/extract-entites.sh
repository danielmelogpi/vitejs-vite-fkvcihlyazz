jq -c '.entities[]? | select(
  (.mentionText | type == "string" and length > 0) and
  (.pageAnchor.pageRefs | type == "array" and length > 0) and
  (.pageAnchor.pageRefs | any(.boundingPoly.normalizedVertices | type == "array" and length > 0))
) | .pageAnchor' ./public/AL2-formatted.json  > public/page-refs.json