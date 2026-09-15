while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    # The name is the second word after 'export (const|function|class|enum)'
    # The grep in find_unused already showed it was the 3rd part of our colon-separated list if we formatted it right.
    # Re-extracting carefully.
    name=$(echo "$line" | sed -E 's/.*export (const|function|class|enum) ([a-zA-Z0-9_]+).*/\2/')
    
    # Strictly unused: Not imported in any other file AND not mentioned by name in any other file.
    # We'll check for imports specifically as a strong indicator.
    
    is_imported=$(grep -r "import .*$name" artifacts/megacity --include="*.ts" --include="*.tsx" --exclude="$(basename $file)" | wc -l)
    
    if [ "$is_imported" -eq 0 ]; then
        # If not explicitly imported, check for any reference at all (could be dynamic or just literal name in some cases, though rare in TS)
        is_referenced=$(grep -r -w "$name" artifacts/megacity --include="*.ts" --include="*.tsx" --exclude="$(basename $file)" | wc -l)
        if [ "$is_referenced" -eq 0 ]; then
            echo "$line"
        fi
    fi
done < engine_value_exports.txt
