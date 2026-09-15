while read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    name=$(echo "$line" | sed -E 's/.*export (const|function|class|enum) ([a-zA-Z0-9_]+).*/\2/')
    
    # We want to find if 'name' is used anywhere other than its definition file.
    # Note: excluding the file itself from the recursive grep.
    # Also we want to ensure it's not just a false positive like 'ACHIEVEMENTS' matching 'ALL_ACHIEVEMENTS'
    # Use -w for whole word matching.
    
    # Exclude definitions in engine if they are only used in engine but exported (technically still exported but only used internally)
    # Actually the query is "never imported or used anywhere else in the codebase"
    # Codebase includes UI and other parts.
    
    count=$(grep -r -w "$name" artifacts/megacity --include="*.ts" --include="*.tsx" --exclude="$(basename $file)" | wc -l)
    if [ "$count" -eq 0 ]; then
        echo "UNUSED: $line"
    fi
done < engine_value_exports.txt
