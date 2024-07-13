
function sortTable(columnIndex) {
    var table = document.getElementById("ranktable");
    var rows = Array.from(table.rows).slice(1);
    var isAsc = table.rows[0].cells[columnIndex].getAttribute("data-order") === "asc";
    rows.sort(function (a, b) {
        var aText = a.cells[columnIndex].innerText;
        var bText = b.cells[columnIndex].innerText;
        return isAsc ? aText.localeCompare(bText) : bText.localeCompare(aText);
    });
    rows.forEach(function (row) {
        table.tBodies[0].appendChild(row);
    });
    table.rows[0].cells[columnIndex].setAttribute("data-order", isAsc ? "desc" : "asc");
}

var cellStates = [
    ['Brawler ▲', 'Brawler ▼'], // For Sortering etter brawler 
    ['Første rank 35 ▲', 'Første rank 35 ▼'], // For sortering etter rank r35
    ['Høyeste trofeer ▲', 'Høyeste trofeer ▼'] // For sortiering etter høyeste trofeer
];

// Function to change text and highlight cell
function changeText(cell, columnIndex) {
    // Get the current text content of the cell
    var currentText = cell.textContent;

    // Find the current state index in the array
    var currentStateIndex = cellStates[columnIndex].indexOf(currentText);

    // Calculate the next state index (cycle through array)
    var nextStateIndex = (currentStateIndex + 1) % cellStates[columnIndex].length;

    // Update cell text content to the next state
    cell.textContent = cellStates[columnIndex][nextStateIndex];

    // Remove highlighted class from all cells in the column
    var allCells = cell.parentElement.parentElement.getElementsByTagName('td');
    for (var i = 0; i < allCells.length; i++) {
        if (i % 3 == columnIndex) { // Adjust for the 3 cells in each row
            allCells[i].classList.remove('highlighted');
        }
    }

    // Add highlighted class to the current cell
    cell.classList.add('highlighted');
}
function handleCellClick(cell) { // Legger begge funksjonene sammen
    sortTable(cell.cellIndex);
    changeText(cell, cell.cellIndex);
}

/* Funksjon for å resette sorteringa (Funker dårlig)

document.addEventListener('click', function(event) {
    var clickedElement = event.target;
    var isClickInsideTable = clickedElement.closest('table') !== null;
    var isClickInsideSpecific = clickedElement.classList.contains('specific-reset');
    
    if (!isClickInsideTable && !isClickInsideSpecific) {
        resetSpecificCells();
    }
});

// Function to reset specific cells to default state
function resetSpecificCells() {
    var cellsToReset = document.querySelectorAll('.specific-reset');
    cellsToReset.forEach(function(cell, index) {
        var columnIndex = index % 3; // Determine which column this cell belongs to
        cell.textContent = cellStates[columnIndex][0]; // Set to default state
        cell.classList.remove('highlighted'); // Remove highlighted class
    });
}
*/

