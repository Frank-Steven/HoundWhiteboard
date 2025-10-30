/**
 * @file Texture management module
 * @module TextureManager
 * @description Handles:
 * - SVG texture generation
 * - Tiled texture creation
 */

const { directory, file, fileNameRandomPool } = require('../classes/io');

// Example line pattern configuration
const lineConfig = {
  svg: 'M 0,50 l 100,0 M 50,0 l 0,100',
  type: 'line',
  thickness: 5,
  color: '#ff0000',
  size: 0.6,
  width: 50,
  height: 50,
  offset_x: 0,
  offset_y: 0
};

// Example fill pattern configuration
const fillConfig = {
  svg: 'M 10,30 A 20,20 0,0,1 50,30 A 20,20 0,0,1 90,30 Q 90,60 50,90 Q 10,60 10,30 z',
  type: 'fill',
  thickness: 0.2,
  color: '#ff0000',
  size: 0.8,
  width: 100,
  height: 100,
  offset_x: 0,
  offset_y: 0
};

/**
 * Generates an SVG texture unit
 * @function generateSVG
 * @param {Object} config - Texture configuration
 * @param {string} config.svg - SVG path data
 * @param {string} config.type - "fill" or "line"
 * @param {number} config.thickness - Stroke width (for line) or scale (for fill)
 * @param {string} config.color - Color in hex format
 * @param {number} config.size - Density/spacing
 * @param {number} config.width - Base width (at size=1)
 * @param {number} config.height - Base height (at size=1)
 * @param {number} config.offset_x - X offset percentage
 * @param {number} config.offset_y - Y offset percentage
 * @returns {SVGSVGElement} SVG element
 */
function generateSVG(config) {
  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  // Set path data
  path.setAttribute('d', config.svg);

  let acturalWidth = config.width;
  let acturalHeight = config.height;

  if (config.type === 'line') {
    // Line mode: set stroke attributes
    path.setAttribute('stroke', config.color);
    path.setAttribute('stroke-width', config.thickness / config.size);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    // Scale dimensions for line mode
    acturalWidth *= config.size;
    acturalHeight *= config.size;
  } else if (config.type === 'fill') {
    // Fill mode: set fill attributes
    path.setAttribute('fill', config.color);
    path.setAttribute('stroke', 'none');
    // Set margins for fill mode
    svg.style.margin = `${acturalHeight * (config.size - 1)}px ${acturalWidth * (config.size - 1)}px`;
  }

  // Add path to SVG
  svg.appendChild(path);

  // Set SVG attributes
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', acturalWidth);
  svg.setAttribute('height', acturalHeight);

  let transfrom = [];
  if (config.type === 'fill') {
    // Apply transform for fill mode
    transfrom.push(`translate(50, 50) scale(${config.thickness}) translate(-50, -50)`);
  }

  if (transfrom.length !== 0) {
    path.setAttribute('transform', transfrom.join(' '));
  }

  return svg;
}

/**
 * Creates a tiled texture container
 * @function createTiledTexture
 * @param {Object} config - Texture configuration
 * @param {number} containerWidth - Container width in pixels
 * @param {number} containerHeight - Container height in pixels
 * @returns {HTMLDivElement} Div element containing tiled texture
 */
function createTiledTexture(config, containerWidth, containerHeight) {
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${containerWidth}px`;
  container.style.height = `${containerHeight}px`;
  container.style.overflow = 'hidden';
  container.style.border = '2px solid #333';

  // Calculate actual unit dimensions
  let unitWidth = config.width;
  let unitHeight = config.height;

  if (config.type === 'line') {
    unitWidth *= config.size;
    unitHeight *= config.size;
  } else if (config.type === 'fill') {
    // Account for margins in fill mode
    const marginX = unitWidth * (config.size - 1);
    const marginY = unitHeight * (config.size - 1);
    unitWidth += marginX * 2;
    unitHeight += marginY * 2;
  }

  // Calculate base rows and columns needed
  const baseCols = Math.ceil(containerWidth / unitWidth);
  const baseRows = Math.ceil(containerHeight / unitHeight);

  // Add extra units for seamless tiling
  const extraUnits = 2;
  const cols = baseCols + extraUnits * 2;
  const rows = baseRows + extraUnits * 2;

  // Calculate total dimensions of tiled pattern
  const totalWidth = cols * unitWidth;
  const totalHeight = rows * unitHeight;

  // Calculate centering offsets
  let offsetX = (containerWidth - totalWidth) / 2;
  let offsetY = (containerHeight - totalHeight) / 2;

  // Apply config offsets (percentage to pixels)
  offsetX += (config.offset_x / 100) * unitWidth;
  offsetY += (config.offset_y / 100) * unitHeight;

  // Create and position tiled SVG elements
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const svg = generateSVG(config);
      svg.style.position = 'absolute';
      svg.style.left = `${offsetX + col * unitWidth}px`;
      svg.style.top = `${offsetY + row * unitHeight}px`;
      container.appendChild(svg);
    }
  }

  return container;
}

module.exports = {
  generateSVG,
  createTiledTexture
};
