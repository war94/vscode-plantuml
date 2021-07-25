(function() {
    var vscode;

    var imageContainer;
    var svgImage;

    var status;
    var settings;

    window.addEventListener("load", () => {
        initPreview();
    });

    function initPreview() {
        if (typeof acquireVsCodeApi !== "undefined") {
            vscode = acquireVsCodeApi();
        }

        imageContainer = document.getElementById("image-container");
        svgImage = imageContainer.getElementsByTagName("svg")[0];

        status = JSON.parse(document.getElementById("status").innerHTML || "{}");
        settings = JSON.parse(document.getElementById("settings").innerHTML);

        if (status && imageContainer && svgImage) {
            imageContainer.scrollLeft = status.scrollLeft;
            imageContainer.scrollTop = status.scrollTop;
            svgImage.style.width = status.width;
            svgImage.style.height = "auto";
            
            initHandlers();
        }

        showErrors();
    };

    function initHandlers() {
        handleMove();
        handleZoom();
        handleClick();
    }

    function showErrors() {
        let hasError = !!document.getElementById("errtxt").innerText.trim();
        if(!hasError) {
            document.getElementById("error-warning").style.display = "none";
        }
        
        if (!settings.showSpinner) {
            document.getElementById("spinner-container").remove();
        }
    }

    function handleClick(){
        svgImage.addEventListener("click", (event) => {
            if(event.target.tagName != "text") {
                return;
            }

            const message = {
                searchText: event.target.innerHTML
            };

            vscode.postMessage(message);
        });
    }

    function handleZoom() {
        let imageWidth = svgImage.width.baseVal.value;

        svgImage.addEventListener("wheel", (ev) => {
            if (!ev.altKey) {
                return;
            }

            ev.preventDefault();

            if (ev.deltaY > 0) {
                imageWidth = parseInt((imageWidth + (imageWidth * 0.1)));
            } else {
                imageWidth = parseInt((imageWidth - (imageWidth * 0.1)));
            }

            svgImage.style.width =  imageWidth + "px";
            saveStatus();
        });
    }

    function handleMove() {
        let moveConfig = {
            isDown: false,
            startX: 0,
            startY: 0,
            scrollLeft: 0,
            scrollTop: 0
        };
        
        imageContainer.addEventListener("mousedown", event => {
            imageContainer.classList.add("active");
            
            moveConfig = {
                isDown: true,
                startX: event.pageX - imageContainer.offsetLeft,
                startY: event.pageY - imageContainer.offsetTop,
                scrollLeft: imageContainer.scrollLeft,
                scrollTop: imageContainer.scrollTop,
            };
        });
                        
        imageContainer.addEventListener("mouseleave", () => {
            imageContainer.classList.remove("active");
            moveConfig.isDown = false;
        });

        imageContainer.addEventListener("mouseup", () => {
            imageContainer.classList.remove("active");
            moveConfig.isDown = false;
        });

        imageContainer.addEventListener("mousemove", event => {
            if (!moveConfig.isDown) {
                return;
            }

            event.preventDefault();
            
            const pageX = event.pageX - imageContainer.offsetLeft;
            const walk = pageX - moveConfig.startX;
            imageContainer.scrollLeft = moveConfig.scrollLeft - walk;

            const pageY = event.pageY - imageContainer.offsetTop;
            const walkY = pageY - moveConfig.startY;
            imageContainer.scrollTop = moveConfig.scrollTop - walkY;
            
            saveStatus();
        });
    }

    function throttle(fn, delay, atleast) {
        var timeout = null,
            startTime = new Date();
        return function (...args) {
            var curTime = new Date();
            clearTimeout(timeout);
            if (curTime - startTime >= atleast) {
                fn(...args);
                startTime = curTime;
            } else {
                timeout = setTimeout(fn, delay, ...args);
            }
        }
    }

    var saveStatus = throttle(() => {
        if (vscode) {
            const status = {
                scrollLeft: imageContainer.scrollLeft,
                scrollTop: imageContainer.scrollTop,
                width: svgImage.style.width
            };

            vscode.postMessage(status);
        }
    }, 500, 1000);
})();