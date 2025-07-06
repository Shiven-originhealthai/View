'use client'

import { useState } from "react"
import DicomViewer from "./DicomViewer"

export default function upload() {
    const [blobstate, setblobstate] = useState(false)
    function handlefilechange(e: any) {
        const file = e.target.files[0]
        const blob = new Blob([file], { type: file.type })
        setblobstate(true)

    }
    return (
        <div>
            <DicomViewer/>
        </div>




    )
}