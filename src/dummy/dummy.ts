import {
  init as coreInit,
} from "@cornerstonejs/core";
import {
  init as dicomImageLoaderInit,
} from "@cornerstonejs/dicom-image-loader";
import {
  init as cornerstoneToolsInit,
} from "@cornerstonejs/tools";
const initializeCornerstone = () => {
    coreInit();
    dicomImageLoaderInit();
    cornerstoneToolsInit();
}
export default initializeCornerstone;