/**
 * PlayerIQ — Friend Autocomplete Helper Component
 * Provides a modern, glassmorphic dropdown suggestions panel for friend emails.
 */

export function initFriendAutocomplete(inputElement, friendsListProvider, isMulti = true) {
  if (!inputElement) return null;

  let dropdown = null;
  let matches = [];
  let selectedIndex = -1;

  // Create the dropdown element
  function createDropdown() {
    if (dropdown) return;
    dropdown = document.createElement('div');
    dropdown.className = 'friend-autocomplete-dropdown';
    
    // Glassmorphism inline styles
    Object.assign(dropdown.style, {
      position: 'absolute',
      background: 'rgba(18, 18, 24, 0.98)',
      backdropFilter: 'blur(20px)',
      webkitBackdropFilter: 'blur(20px)',
      border: '1.5px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
      zIndex: '100000',
      maxHeight: '200px',
      overflowY: 'auto',
      padding: '6px',
      display: 'none',
      boxSizing: 'border-box'
    });

    document.body.appendChild(dropdown);
  }

  // Update positioning of the dropdown right below the input element
  function positionDropdown() {
    if (!dropdown || !inputElement) return;
    const rect = inputElement.getBoundingClientRect();
    
    // Position dropdown absolute to body
    dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    dropdown.style.width = `${rect.width}px`;
  }

  // Hide the dropdown
  function hideDropdown() {
    if (dropdown) {
      dropdown.style.display = 'none';
    }
    selectedIndex = -1;
  }

  // Show and render dropdown list items
  function renderDropdown() {
    if (!dropdown) createDropdown();
    
    if (matches.length === 0) {
      hideDropdown();
      return;
    }

    // Populate dropdown HTML
    dropdown.innerHTML = matches.map((friend, idx) => {
      const isSelected = idx === selectedIndex;
      const highlightStyle = isSelected 
        ? 'background: rgba(168, 85, 247, 0.15); border-left: 3px solid var(--accent, #a855f7);' 
        : 'border-left: 3px solid transparent;';

      return `
        <div class="autocomplete-item" data-index="${idx}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; cursor:pointer; transition:background 0.2s; ${highlightStyle}">
          <img src="${friend.avatar}" style="width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0; background:rgba(255,255,255,0.05);" alt="" />
          <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
            <span style="font-size:12px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${friend.name}</span>
            <span style="font-size:10px; color:rgba(255,255,255,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${friend.email}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to items
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const idx = parseInt(item.dataset.index, 10);
        selectFriend(matches[idx]);
      });
      // Mouseover updates selectedIndex for keyboard visual alignment
      item.addEventListener('mouseover', () => {
        selectedIndex = parseInt(item.dataset.index, 10);
        // Highlight without re-rendering to keep UI fast
        dropdown.querySelectorAll('.autocomplete-item').forEach((el, elIdx) => {
          if (elIdx === selectedIndex) {
            el.style.background = 'rgba(168, 85, 247, 0.15)';
            el.style.borderLeft = '3px solid var(--accent, #a855f7)';
          } else {
            el.style.background = 'transparent';
            el.style.borderLeft = '3px solid transparent';
          }
        });
      });
    });

    dropdown.style.display = 'block';
    positionDropdown();
  }

  // Handle friend selection
  function selectFriend(friend) {
    if (!friend || !inputElement) return;

    const value = inputElement.value;
    const email = friend.email || '';

    if (isMulti) {
      const cursorPos = inputElement.selectionStart || 0;
      const lastCommaIndex = value.lastIndexOf(',', cursorPos - 1);
      
      const beforeToken = value.substring(0, lastCommaIndex + 1);
      const afterToken = value.substring(cursorPos);
      
      const spacePrefix = (lastCommaIndex >= 0 && !beforeToken.endsWith(' ')) ? ' ' : '';
      const selectedText = `${spacePrefix}${email}, `;
      
      inputElement.value = beforeToken + selectedText + afterToken;
      
      const newCursorPos = beforeToken.length + selectedText.length;
      inputElement.focus();
      inputElement.setSelectionRange(newCursorPos, newCursorPos);
    } else {
      inputElement.value = email;
      inputElement.focus();
    }

    // Trigger standard input/change events to notify listeners (if any)
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));

    hideDropdown();
  }

  // Fetch friends list, filter and update matches
  function handleInput() {
    const value = inputElement.value;
    let query = '';

    if (isMulti) {
      const cursorPos = inputElement.selectionStart || 0;
      const lastCommaIndex = value.lastIndexOf(',', cursorPos - 1);
      query = value.substring(lastCommaIndex + 1, cursorPos).trim();
    } else {
      query = value.trim();
    }

    if (!query) {
      matches = [];
      hideDropdown();
      return;
    }

    // Resolve friends list
    const friends = typeof friendsListProvider === 'function' 
      ? friendsListProvider() 
      : (friendsListProvider || []);

    const lowercaseQuery = query.toLowerCase();
    
    // Filter by display name or email matching the query segment
    matches = friends.filter(f => 
      (f.name && f.name.toLowerCase().includes(lowercaseQuery)) ||
      (f.email && f.email.toLowerCase().includes(lowercaseQuery))
    );

    selectedIndex = matches.length > 0 ? 0 : -1;
    renderDropdown();
  }

  // ---- Event Listeners ----

  const onInput = () => handleInput();
  const onFocus = () => handleInput();
  
  const onKeyDown = (e) => {
    if (dropdown && dropdown.style.display === 'block') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % matches.length;
        renderDropdown();
        // Scroll item into view
        const activeItem = dropdown.querySelector(`.autocomplete-item[data-index="${selectedIndex}"]`);
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
        renderDropdown();
        // Scroll item into view
        const activeItem = dropdown.querySelector(`.autocomplete-item[data-index="${selectedIndex}"]`);
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < matches.length) {
          e.preventDefault();
          selectFriend(matches[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideDropdown();
      }
    }
  };

  const onScrollResize = () => {
    if (dropdown && dropdown.style.display === 'block') {
      positionDropdown();
    }
  };

  const onDocMouseDown = (e) => {
    if (!dropdown) return;
    // Hide if clicked outside both input and dropdown
    if (!inputElement.contains(e.target) && !dropdown.contains(e.target)) {
      hideDropdown();
    }
  };

  inputElement.addEventListener('input', onInput);
  inputElement.addEventListener('focus', onFocus);
  inputElement.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onScrollResize);
  window.addEventListener('scroll', onScrollResize, true); // capture scrolls
  document.addEventListener('mousedown', onDocMouseDown);

  // Return a cleanup function to release listeners and elements
  return {
    destroy: () => {
      inputElement.removeEventListener('input', onInput);
      inputElement.removeEventListener('focus', onFocus);
      inputElement.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
      document.removeEventListener('mousedown', onDocMouseDown);
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
    },
    reposition: () => positionDropdown()
  };
}
