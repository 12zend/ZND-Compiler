#!/bin/bash
set -e

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo ""
echo "Build complete! Output in ./dist/"
echo ""
echo "To run locally:"
echo "  npm run dev"
echo ""
echo "To deploy:"
echo "  Netlify: npm install -g netlify-cli && netlify deploy --prod --dir=dist"
echo "  Vercel:  vercel deploy --prod dist"
